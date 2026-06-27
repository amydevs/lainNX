import * as fs from "node:fs";
import * as path from "node:path";

const nxjsConfig = () => ({
    closeBundle() {
        fs.cpSync(path.join(process.cwd(), "nxjs.ini"), path.join("romfs", "nxjs.ini"));
    }
})

export default nxjsConfig;