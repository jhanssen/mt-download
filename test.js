/*global require,process,setTimeout*/

const mtdl = require("./index");
//let url = "http://releases.ubuntu.com/16.04/SHA256SUMS.gpg";
let url = "http://releases.ubuntu.com/16.04/ubuntu-16.04.2-server-i386.template";
let ctrl;
mtdl({ url: url, path: "." })
    .then((obj) => {
        ctrl = obj;
        ctrl.on("finished", () => {
            console.log("finito");
            //process.exit();
        });
        ctrl.start();
        console.log(ctrl);
        // process.exit();
    }).catch((err) => {
        console.log(err);
        //process.exit();
    });

// (function wait () {
//     console.log(ctrl);
//     setTimeout(wait, 1000);
// })();

process.on('uncaughtException', function (err) {
    console.log(err, ctrl);
});

process.on("exit", function(code) {
    console.log("about to exit", code, ctrl);
});
