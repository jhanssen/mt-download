/*global require,module*/
const fs = require("fs");
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
            tmp.file({ postfix: ".mtdlm", dir: opts.path, keep: true, detachDescriptor: true }, (err, p, fd) => {
                if (err) {
                    reject(err);
                    return;
                }
                fs.truncate(fd, length + (threads * 8) + 8 , err => {
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
