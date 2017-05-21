/*global require,process,setTimeout,setInterval*/

const mtdl = require("./index");
//let url = "http://releases.ubuntu.com/16.04/SHA256SUMS.gpg";
let url = "http://releases.ubuntu.com/16.04/ubuntu-16.04.2-server-i386.template";
let ctrl;
mtdl.prepare({ url: url, path: ".", threads: 8 })
    .then((obj) => {
        ctrl = obj;
        ctrl.on("state", (s) => {
            console.log("got state", s);
            if (s == mtdl.State.Finished) {
                console.log("finito");
                //process.exit();
            }
        });
        ctrl.on("progress", (perc) => {
            console.log("progress", perc);
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

let paused = false;
function togglePause() {
    if (ctrl) {
        if (!paused) {
            console.log("pausing");
            ctrl.stop();
            paused = true;
        } else {
            console.log("resuming");
            ctrl.start();
            paused = false;
        }
    }
}
setInterval(togglePause, 2000);
