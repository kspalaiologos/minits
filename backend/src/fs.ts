
import fs from "fs";

export const mkdir_optional = (name: string) =>
    !fs.existsSync(name) && fs.mkdirSync(name);
