/*global require,process*/

const mtdl = require("./index");
let url = "http://releases.ubuntu.com/16.04/SHA256SUMS.gpg";
//let url = "http://releases.ubuntu.com/16.04/ubuntu-16.04.2-server-i386.template";
mtdl({ url: url, path: "." })
    .then((obj) => {
        obj.on("finished", () => {
            console.log("finito");
            process.exit();
        });
        obj.start();
        console.log(obj);
        // process.exit();
    }).catch(() => {
        process.exit();
    });
