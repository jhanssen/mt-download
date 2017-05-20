/*global require,module*/
const request = require("request");
const EventEmitter = require("events");
const Writable = require("stream").Writable;
const fs = require("fs");

class WriteProxy extends Writable
{
    constructor(path, start, options) {
        super(options);
        this._writable = fs.createWriteStream(path, { start: start });
        this._writable.on("error", err => {
            console.log("from here?", err);
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
    if (end == undefined)
        end = "";
    out.headers.Range = `bytes=${start}-${end}`;
    console.log(out);
    return out;
}

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
    }

    start() {
        if (this._requests !== undefined)
            return;
        this._requests = [];
        this._finished = 0;
        if (this.threads == 1 || this.length == -1) {
            this._makeRequest();
        } else {
            let start = 0;
            let per = Math.floor(this.length / this.threads);
            for (let idx = 0; idx < this.threads; ++idx) {
                this._makeRequest(start, idx == this.threads - 1 ? undefined : start + per - 1);
                start += per;
            }
        }
    }

    stop() {
        if (this._requests == undefined)
            return;
        let req = this._requests;
        this._requests = undefined;
        this._finished = undefined;
        for (let idx = 0; idx < req.length; ++idx) {
            req[idx].destroy();
        }
    }

    serialize() {
    }

    _makeRequest(start, end) {
        let req;
        if (start == undefined) {
            // simple request
            let stream = new WriteProxy(this.path, 0);
            stream.on("finish", () => {
                this._finish();
            });
            stream.on("error", () => {
                console.log("bad");
            });
            req = request.get(this.opts.url).pipe(stream);
            this._requests.push(req);
            req.on("error", err => {
                console.log("eh1?", err);
                this.stop();
                this.emit("error", err);
            });
        } else {
            let stream = new WriteProxy(this.path, start);
            stream.on("finish", () => {
                this._finish(start, end);
            });
            stream.on("error", () => {
                console.log("bad");
            });
            req = request.get(urlify(this.opts.url, start, end)).pipe(stream);
            this._requests.push(req);
            req.on("error", err => {
                console.log("eh2?", err.stack);
                this.stop();
                this.emit("error", err);
            });
        }
    }

    _finish(start, end) {
        if (++this._finished == this._requests.length) {
            // we're all done
            this.emit("finished");
        }
    }
}

Controller.deserialize = function(data) {
};

module.exports = Controller;
