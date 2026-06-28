import { Duplex, Readable } from "stream"
import { finished } from "stream/promises"


await fetch("https://google.com")
    .then((e) => e.body)
    .then((b) => {
        return new Promise((resolve, reject) => {
            const doneCb = () => {
                console.log("hi")
                resolve()
            }
            b.pip
            Duplex.toWeb
            const readable = Readable.fromWeb(b);
            readable
                .on("end", () => doneCb)
                .on("finish", () => doneCb)
                .on("end", () => doneCb)
                .on("error", reject)
        })
    })