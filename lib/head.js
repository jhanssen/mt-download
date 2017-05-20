/*global require,module*/

const request = require("request");
const get = require("./get");

function head(opts)
{
    if (typeof opts !== "object") {
        throw "Need an options object";
    }
    if (!("path" in opts)) {
        throw "Need path in options";
    }
    if (!("url" in opts)) {
        throw "Need url in options";
    }
    return new Promise((resolve, reject) => {
        let req = request.head(opts.url);
        req.on("error", (err) => {
            reject(err);
        });
        req.on("response", (resp) => {
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                reject(new Error(`Got status ${resp.statusCode}`));
            } else {
                resolve(get(resp, opts));
            }
        });
    });
}

module.exports = head;
