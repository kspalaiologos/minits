
import fs, { watchFile } from "fs";

type ServerConfig = {
    port: number | undefined,
    maxZipballMiB: number,
    tokens: Object
}

const loadConfig = (): ServerConfig =>
    JSON.parse(fs.readFileSync("ci.json").toString('utf-8'))

let callback:(() => void) | null = null
let config:ServerConfig = loadConfig()

watchFile("ci.json", () => {
    config = loadConfig()
    if(callback != null)
        callback()
})

export const setChangeHandler = (handler: () => void) =>
    callback = handler

export const getConfig = (): ServerConfig =>
    config
