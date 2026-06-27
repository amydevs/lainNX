import * as fs from "node:fs";
import * as path from "node:path";

const nxjsConfig = () => ({
    closeBundle() {
        for (const file of ["nxjs.ini", "loading.jpg"]) {
            fs.cpSync(path.join(process.cwd(), file), path.join("romfs", file));
        }
    }
})

export default nxjsConfig;