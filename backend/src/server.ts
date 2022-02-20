
import express, { Request, response, Response, Router } from "express";
import FileUpload from "express-fileupload";
import BodyParser from "body-parser";
import { logger } from "./logging";
import { has_task, logback_task, task_status } from "./job";
import { getConfig, setChangeHandler } from "./server_config";

const asMap = (input: any): Map<string, string> => {
    let map = new Map<string, string>()
    for(const value in input)
        map.set(value, input[value])
    return map
}

export const logback_ret = (id: number, res: Response) =>
    logback_task(id, () => res.status(200).send(task_status(id)), err => res.status(304).send(task_status(id)))

export const guard_token = (callback: (req: Request, res: Response, cause: string) => void) =>
    (req: Request, res: Response) => {
        if(typeof req.body.token == 'string')
            if(asMap(getConfig().tokens).has(req.body.token))
                callback(req, res, asMap(getConfig().tokens).get(req.body.token)!)
            else
                response.status(403).send("unrecognised token. access denied.")
        else
            response.status(400).send("missing access token.")
    }

export const guard_id = (callback: (req: Request, res: Response, id: number) => void) =>
    (req: Request, res: Response) => {
        const id = parseInt(req.params.id)

        if(has_task(id))
            callback(req, res, id)
        else
            res.status(400).send("No such job.")
    }

export const guard_token_id = (callback: (req: Request, res: Response, id: number, cause: string) => void) =>
    guard_id((req: Request, res: Response, id: number) =>
        guard_token((req: Request, res: Response, cause: string) =>
            callback(req, res, id, cause)
        )
    )

export const start = (setupApp: (app: Router) => void) => {
    const app = express();

    const port = getConfig().port || 8080;

    app.use(FileUpload({
        limits: {
            fileSize: 1024 * 1024 * getConfig().maxZipballMiB
        },
    }));

    app.use(BodyParser.json());
    app.use(BodyParser.urlencoded({extended: true}));

    let router = express.Router()

    setupApp(router)

    app.use(router)

    const server = app.listen(port, () => {
        logger.info(`Minits started, listening at https://localhost:${port}`);
    });

    setChangeHandler(() => {
        logger.warn("Configuration changed. Reloading.")

        server.close(err => {
            logger.info("Server closed.")

            start(setupApp)

            logger.info("Restarted.")
        })
    })
}
