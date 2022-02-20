
import fs from "fs";
import rimraf from "rimraf";
import unzip from "extract-zip";
import path from "path";
import child_process from "child_process";

import { logger } from "./logging";
import { mkdir_optional } from "./fs";
import { add_process, create_task, finish_process, finish_task, is_running, job_error, job_error_basic, task_status, task_short_status, update_status, is_alive } from "./job";
import { guard_id, guard_token, guard_token_id, logback_ret, start } from "./server";

type jobconfig = { fast_fail:boolean, jobs:string[] }

['logs', 'jobs'].forEach(x => mkdir_optional(x));

start(app => {
    app.get("/api/query/:id", guard_id((req, res, id) => {
        if(!is_running(id)) {
            logger.warn(`Job ${id} finished; after a status query - logging back.`);
            logback_ret(id, res)
        } else {
            res.status(200).send(task_status(id))
        }
    }))

    app.get("/api/shortquery/:id", guard_id((req, res, id) => {
        res.status(200).send(task_short_status(id))
    }))
    
    app.post("/api/stop/:id", guard_token_id((req, res, id, cause) => {
        if(is_running(id)) {
            logger.warn(`Stopping job ${id} (cause: ${cause}).`);
            logback_ret(id, res)
        } else {
            res.status(400).send("Job not running.")
        }
    }))
    
    app.post("/api/start", guard_token((req, res, cause) => {
        if(!req.files) {
            res.status(400).send("No file uploaded.");
        } else {
            const taskId = create_task(cause)
            
            const targetdir = `jobs/j${taskId}`;
            const filename = `jobs/j${taskId}-data.zip`;
    
            mkdir_optional(targetdir);
    
            (req.files.zipball as any).mv(filename, (err: any) => {
                if(err != undefined) {
                    finish_task(taskId, "unable to save the data")
                    logger.error("Couldn't save the job data.", err);
                    return;
                }

                if(!is_alive(taskId)) { logger.warn(`${taskId} aborted prematurely`); fs.unlinkSync(filename); return; }
    
                logger.info(`[${taskId}] Requested to start a job (by ${cause}); saving the archive to ${filename}`);
    
                res.status(200).send(task_status(taskId));
    
                unzip(filename, { dir: path.resolve(targetdir) }).then(ok => {
                    update_status(taskId, x => { x.unpacked = true; return x; })
                    logger.info(`[${taskId}] Unpacked.`)
    
                    fs.unlinkSync(filename)

                    if(!is_alive(taskId)) { logger.warn(`${taskId} aborted prematurely`); rimraf.sync(targetdir); return; }
    
                    if(fs.existsSync(`${targetdir}/config.json`)) {
                        let finishedJobs = 0
                        let singleErrored = false
                        
                        const data:jobconfig = JSON.parse(fs.readFileSync(`${targetdir}/config.json`).toString('utf8'))
    
                        logger.info(`[${taskId}] Received and read the build configuration.`)
    
                        if(data.jobs == undefined || data.fast_fail == undefined) {
                            job_error_basic(taskId, "malformed config: no jobs or fast_fail")
                            rimraf.sync(targetdir)
                            return;
                        }
    
                        update_status(taskId, x => { x.running = true; return x; })
    
                        data.jobs.forEach((job, idx) => {
                            logger.warn(`[${taskId}] Launched job ${idx}.`)

                            if(!is_alive(taskId)) { logger.warn(`${taskId} aborted prematurely`); rimraf.sync(targetdir); return; }
    
                            add_process(taskId, child_process.exec(job, {
                                cwd: targetdir
                            }, (error, stdout, stderr) => {
                                let exitCode = 0
    
                                if(error != undefined) {
                                    logger.error(`[${taskId} : ${idx}] Task errored.`, error)
                                    exitCode = error.code || 1
                                } else {
                                    logger.info(`[${taskId} : ${idx}] Task succeded.`)
                                }
    
                                finish_process(taskId, idx, stderr, stdout, exitCode)
    
                                if(exitCode != 0) {
                                    singleErrored = true
    
                                    if(data.fast_fail) {
                                        logger.warn(`Job ${taskId} failed because fast_fail is set. Stopping other executors.`);
                                        
                                        finish_task(taskId, "errored")
                                        logback_ret(taskId, res)
                                    }
                                }
    
                                finishedJobs++
    
                                if(finishedJobs == data.jobs.length) {
                                    logger.warn(`[${taskId}] Done, stopping.`)
                                    finish_task(taskId, singleErrored ? "errored" : "ok")
                                    rimraf.sync(targetdir)
                                }
                            }))
                        })
                    } else {
                        job_error_basic(taskId, "couldn't find config.json")
                        rimraf.sync(targetdir)
                    }
                }, err => {
                    job_error(taskId, "unable to unpack the archive. maybe it's too big?", err)
                    rimraf.sync(targetdir)
                    fs.unlinkSync(filename)
                })
            })
        }
    }))
})
