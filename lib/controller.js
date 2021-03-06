/*global require,module,Buffer*/
const request = require("request");
const EventEmitter = require("events");
const Writable = require("stream").Writable;
const fs = require("fs");
const path = require("path");
const urldecode = require("urldecode");

class WriteProxy extends Writable
{
    constructor(path, start, offset, end, reporter, options) {
        super(options);
        this._start = start;
        this._offset = offset;
        this._end = end;
        this._reporter = reporter;
        this._writable = fs.createWriteStream(path, { flags: "a", start: offset });
        this._writable.on("error", err => {
            this.emit("error", err);
        });
        this._writable.on("finish", () => {
            this.emit("finish");
        });
        this._writable.on("close", () => {
            this.emit("close");
        });
        this._writable.on("drain", () => {
            this.emit("drain");
        });
        this._writable.on("pipe", src => {
            this.emit("pipe", src);
        });
        this._writable.on("unpipe", src => {
            this.emit("unpipe", src);
        });
    }

    write(chunk, encoding, callback) {
        console.log("write", chunk.length);
        this._offset += chunk.length;
        this._reporter.report(chunk.length, this._offset, this._start, this._end);
        return this._writable.write(chunk, encoding, callback);
    }

    end(chunk, encoding, callback) {
        return this._writable.end(chunk, encoding, callback);
    }

    setDefaultEncoding(encoding) {
        return this._writable.setDefaultEncoding(encoding);
    }

    cork() {
        return this._writable.cork();
    }

    uncork() {
        return this._writable.uncork();
    }

    getOffset() {
        return this._offset;
    }

    getStart() {
        return this._start;
    }

    getEnd() {
        return this._end;
    }
}

function urlify(url, start, end)
{
    if (typeof url == "string")
        return urlify({ url: url }, start, end);
    let out = {};
    for (let k in url) {
        if (k == "headers") { // special
            let hdrs = {};
            for (let h in url.headers) {
                hdrs[h] = url.headers[h];
            }
            out.headers = hdrs;
        } else {
            out[k] = url[k];
        }
    }
    if (start == undefined)
        return out;
    if (!("headers" in out))
        out.headers = {};
    out.headers.Range = `bytes=${start}-${end}`;
    // console.log(out);
    return out;
}

class Reporter extends EventEmitter {
    constructor(ctrl) {
        super();
        this.ctrl = ctrl;
        this._total = 0;
    }

    set total(t) {
        this._total += t;
    }
    get total() {
        return this._total;
    }

    reinit() {
        this._total = 0;
    }

    report(chunk, offset, start, end) {
        this._total += chunk;
        this.emit("progress", this._total);
    }
};

class Controller extends EventEmitter {
    constructor(threads, path, opts, length)
    {
        super();
        this.threads = threads;
        this.path = path;
        this.opts = opts;
        this.length = length;
        this._requests = undefined;
        this._finished = undefined;
        this._running = undefined;
        this._first = true;
        this._reporter = new Reporter(this);
        this._reporter.on("progress", total => {
            this.emit("progress", total / this.length * 100, total, this.length);
        });
    }

    start() {
        if (this._requests !== undefined)
            return;
        this.emit("state", Controller.State.Starting);
        this._requests = [];
        this._finished = 0;
        this._reporter.reinit();
        if (this._first) {
            if (this.threads == 1 || this.length == -1) {
                this._makeRequest();
                this.emit("state", Controller.State.Started);
            } else {
                let start = 0;
                let per = Math.floor(this.length / this.threads);
                for (let idx = 0; idx < this.threads; ++idx) {
                    this._makeRequest(start, start, idx == this.threads - 1 ? this.length : start + per - 1);
                    start += per;
                }
                this.emit("state", Controller.State.Started);
            }
            this._first = false;
        } else {
            // are we completely done?
            fs.stat(this.path, (err, stats) => {
                if (err) {
                    this._requests = undefined;
                    this._finished = undefined;
                    this.emit("error", new Error(`Unable to stat ${this.path}`));
                    this.emit("state", Controller.State.Error);
                    return;
                }
                if (stats.size == this.length) {
                    this._requests = undefined;
                    this._finished = undefined;
                    this.emit("state", Controller.State.Finished);
                    return;
                }
                if (this.length == -1) {
                    this._makeRequest();
                    this.emit("state", Controller.State.Started);
                } else {
                    this._loadMeta().then(metas => {
                        if (!metas.length) {
                            this._makeRequest();
                            this.emit("state", Controller.State.Started);
                        } else {
                            let started = 0;
                            for (let idx = 0; idx < metas.length; ++idx) {
                                started += metas[idx].offset - metas[idx].start;
                                this._makeRequest(metas[idx].start, metas[idx].offset, metas[idx].end);
                            }
                            this._reporter.total = started;
                            this.emit("state", Controller.State.Started);
                        }
                    }).catch(err => {
                        // console.error("loadMeta failed", err);
                        this.emit("error", err);
                        this.emit("state", Controller.State.Error);
                    });
                }
            });
        }
        // console.log(this._requests);
    }

    stop() {
        if (this._requests == undefined)
            return;
        this.emit("state", Controller.State.Stopping);
        let req = this._requests;
        this._requests = undefined;
        this._running = req.length;
        for (let idx = 0; idx < req.length; ++idx) {
            req[idx].request.abort();
        }
        this._syncMeta(req);
    }

    serialize() {
    }

    _syncMeta(reqs) {
        if (!reqs || this.length == -1)
            return;
        let stream = fs.createWriteStream(this.path, { flags: "a", start: this.length });
        let buf = Buffer.alloc(1024);
        buf.writeDoubleLE(reqs.length, 0);
        let off = 8;
        for (let idx = 0; idx < reqs.length; ++idx) {
            buf.writeDoubleLE(reqs[idx].stream.getStart(), off);
            buf.writeDoubleLE(reqs[idx].stream.getEnd(), off + 8);
            buf.writeDoubleLE(reqs[idx].stream.getOffset(), off + 16);
            off += 24;
        }
        stream.end(buf);
    }

    _loadMeta() {
        return new Promise((resolve, reject) => {
            let stream = fs.createReadStream(this.path, { flags: "r", start: this.length });
            stream.on("readable", () => {
                let metas = [];
                let buf = stream.read(1024);
                if (buf instanceof Buffer) {
                    let num = buf.readDoubleLE(0);
                    let off = 8;
                    for (let idx = 0; idx < num; ++idx) {
                        let start = buf.readDoubleLE(off);
                        let end = buf.readDoubleLE(off + 8);
                        let offset = buf.readDoubleLE(off + 16);
                        metas.push({ start: start, end: end, offset: offset });
                        off += 24;
                    }
                }
                resolve(metas);
            });
            stream.on("error", err => {
                reject(err);
            });
        });
    }

    _makeRequest(start, offset, end) {
        if (offset >= end)
            return;
        let req;
        if (start == undefined) {
            // simple request
            let stream = new WriteProxy(this.path, 0, 0, -1, this._reporter);
            stream.on("finish", () => {
                this._finish();
            });
            stream.on("error", () => {
                console.log("bad");
            });
            stream.on("drain", () => {
                this._syncMeta(this._requests);
            });
            req = request.get(this.opts.url);
            let strm = req.pipe(stream);
            this._requests.push({ request: req, stream: stream });
            strm.on("error", err => {
                this.stop();
                this.emit("error", err);
                this.emit("state", Controller.State.Error);
            });
        } else {
            let stream = new WriteProxy(this.path, start, offset, end, this._reporter);
            stream.on("finish", () => {
                this._finish(start, end);
            });
            stream.on("error", () => {
                console.log("bad");
            });
            stream.on("drain", () => {
                this._syncMeta(this._requests);
            });
            req = request.get(urlify(this.opts.url, offset, end));
            let strm = req.pipe(stream);
            this._requests.push({ request: req, stream: stream });
            strm.on("error", err => {
                this.stop();
                this.emit("error", err);
                this.emit("state", Controller.State.Error);
            });
        }
    }

    _finish(start, end) {
        if (!this._requests) {
            if (this._running !== undefined) {
                if (++this._finished == this._running) {
                    this.emit("state", Controller.State.Stopped);
                    this._finished = undefined;
                    this._running = undefined;
                }
            }
            return;
        }
        if (++this._finished == this._requests.length) {
            this.emit("state", Controller.State.Stopped);
            this._requests = undefined;
            this._finished = undefined;

            // we're all done, rename to final file name
            let url = urldecode(urlify(this.opts.url).url);
            let slash = url.lastIndexOf("/");
            let fn;
            if (slash == -1)
                fn = "index.html";
            fn = url.substr(slash + 1);
            if (!fn.length)
                fn = "index.html";
            const topath = path.join(path.dirname(this.path), fn);
            fs.rename(this.path, topath, err => {
                if (err) {
                    fs.unlink(this.path);
                    this.emit("error", new Error(`Unable to rename to ${topath}`));
                    this.emit("state", Controller.State.Error);
                } else {
                    fs.truncate(topath, this.length, err => {
                        if (err) {
                            fs.unlink(topath);
                            this.emit("error", new Error(`Unable to finalize`));
                            this.emit("state", Controller.State.Error);
                        } else {
                            this.path = topath;
                            this.emit("state", Controller.State.Finished);
                        }
                    });
                }
            });
        }
    }
}

Controller.deserialize = function(data) {
};

Controller.State = { Stopping: 0, Stopped: 1, Starting: 2, Started: 3, Finished: 4, Error: 5 };

module.exports = Controller;
