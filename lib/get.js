/*global require,module*/
const fs = require("fs");
const path = require("path");
const tmp = require("tmp");
const request = require("request");
const Controller = require("./controller");

function headerValue(obj, key)
{
    for (let p in obj) {
        if (obj.hasOwnProperty(p) && key == (p + "").toLowerCase())
            return obj[p];
    }
    return "";
}

function fn(path)
{
}

function prepare(opts, length, threads)
{
    return new Promise((resolve, reject) => {
        if (typeof length == "number") {
            // preallocate file
            let prepareMulti = () => {
                tmp.file({ postfix: ".mtdlm", dir: opts.path, keep: true, detachDescriptor: true }, (err, p, fd) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    fs.truncate(fd, length + 1024 , err => {
                        const bail = () => {
                            fs.closeSync(fd);
                            fs.unlink(p);
                        };
                        if (err) {
                            bail();
                            reject(err);
                            return;
                        }
                        fs.closeSync(fd);
                        resolve(p);
                    });
                });
            };
            if ("file" in opts) {
                // we already have a file, check if the file size seems reasonable
                fs.stat(opts.file, (err, stats) => {
                    if (!err && stats.size == length + 1024) {
                        // we're good
                        resolve(opts.file);
                    } else {
                        switch (path.extname(opts.file)) {
                        case ".mtdls":
                        case ".mtdlm":
                            fs.unlink(opts.file);
                            break;
                        }
                        prepareMulti();
                    }
                });
            } else {
                prepareMulti();
            }
        } else {
            tmp.file({ postfix: ".mtdls", dir: opts.path, keep: true }, (err, p, fd) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(p);
            });
        }
    });
}

function mtget(opts, length)
{
    return new Promise((resolve, reject) => {
        const threads = opts.threads || 2;
        prepare(opts, length, threads).then(p => {
            resolve(new Controller(threads, p, opts, length));
        }).catch(err => {
            reject(err);
        });
    });
}

function stget(opts)
{
    return new Promise((resolve, reject) => {
        prepare(opts).then(p => {
            resolve(new Controller(1, p, opts, -1));
        }).catch(err => {
            reject(err);
        });
    });
}

function get(head, opts) {
    // check if the server accepts ranges
    const acceptRanges = headerValue(head.headers, "accept-ranges");
    const contentLength = headerValue(head.headers, "content-length");
    if (contentLength.length > 0 && acceptRanges == "bytes") {
        return mtget(opts, parseInt(contentLength));
    } else {
        return stget(opts);
    }
}

module.exports = get;
