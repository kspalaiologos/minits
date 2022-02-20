
import { ChildProcess } from "child_process";
import fs from "fs";
import { logger } from "./logging";

let jobCount = 0

export type JobResult = {
    output: string,
    error: string,
    result: undefined | number,
    finished: boolean
};

export type JobStatus = {
    alive: boolean,
    running: boolean,
    unpacked: boolean,
    message: string
}

type CommonTaskData = {
    resultmatrix: JobResult[],
    status: JobStatus,
    cause: string
}

export type Task = {
    processes: (ChildProcess | null)[]
} & CommonTaskData

export type PublicTaskStatus = {
    id: number
} & CommonTaskData

export type ShortPublicTaskStatus = {
    id: number,
    resultmatrix: {
        result: undefined | number,
        finished: boolean
    }[],
    status: JobStatus,
    cause: string
}

let tasks:Map<number, Task> = new Map()

const halt_job = (id: number, err: (err: string) => void, ok: () => void) => {
    if(tasks.has(id)) {
        tasks.get(id)!.status.alive = false

        const length = tasks.get(id)?.processes.map(
            x => x != null ? x.kill() : true
        ).filter(x => !x).length ?? 1;

        if(length > 0) {
            err("couldn't stop one of the jobs.")
            tasks.delete(id)
        }

        ok()
    }

    err("no such job: " + id)
}

export const has_task = (id: number): boolean =>
    tasks.has(id);

export const is_running = (taskId: number): boolean =>
    tasks.has(taskId) && tasks.get(taskId)!.status.running;

export const is_alive = (taskId: number): boolean =>
    tasks.has(taskId) && tasks.get(taskId)!.status.alive;

    export const task_status = (taskId: number): PublicTaskStatus | undefined => {
    if(!has_task(taskId))
        return undefined;
    
    let task = tasks.get(taskId)!
    
    return {
        id: taskId,
        resultmatrix: task.resultmatrix,
        status: task.status,
        cause: task.cause
    }
}

export const task_short_status = (taskId: number): ShortPublicTaskStatus | undefined => {
    if(!has_task(taskId))
        return undefined;
    
    let task = tasks.get(taskId)!
    
    return {
        id: taskId,
        resultmatrix: task.resultmatrix.map(x => ({ result: x.result, finished: x.finished })),
        status: task.status,
        cause: task.cause
    }
}

export const add_process = (taskId: number, process: ChildProcess): number => {
    if(!has_task(taskId))
        return -1;
    tasks.get(taskId)!.processes.push(process)
    return tasks.get(taskId)!.processes.length - 1;
}

export const update_status = (taskId: number, statusCallback: (old: JobStatus) => JobStatus) => {
    if(has_task(taskId))
        tasks.get(taskId)!.status = statusCallback(tasks.get(taskId)!.status)
}

export const finish_process = (taskId: number, pid: number, stderr: string, stdout: string, result: number) => {
    tasks.get(taskId)!.processes[pid] = null
    tasks.get(taskId)!.resultmatrix[pid] = { finished: true, error: stderr, output: stdout, result: result }
}

export const finish_task = (taskId: number, status: string) => {
    if(has_task(taskId)) {
        tasks.get(taskId)!.status.message = status
        tasks.get(taskId)!.status.running = false
        tasks.get(taskId)!.status.alive = false
    }
}

export const job_error = (id:number, result: string, log_message: string, ...args: any[]) => {
    if(has_task(id)) {
        logger.error(`[${id}] Errored, stopping the task and reporting the error...`)
        logback_task(id, () => {
            tasks.get(id)!.status.message = result;
            tasks.get(id)!.status.running = false;
            tasks.get(id)!.status.alive = false;
            logger.info(`[${id}] ${log_message}`, ...args);
        }, err => {
            tasks.get(id)!.status.message = "couldn't logback an errored task";
            tasks.get(id)!.status.running = false;
            tasks.get(id)!.status.alive = false;
            logger.info(`[${id}] original cause: ${log_message}`, ...args)
        })
    }
}

export const job_error_basic = (id:number, result: string) =>
    job_error(id, result, result)

export const create_task = (cause: string):number => {
    tasks.set(jobCount, {
        status: {
            message: "ok",
            running: false,
            unpacked: false,
            alive: true
        },

        resultmatrix: [],
        processes: [],
        cause: cause
    });

    return jobCount++;
}

const currentDate = () =>
    new Date().toLocaleString().slice(0, 9).replace(/\//g,'-')

export const logback_task = (id: number, ok_cb: () => void, err_cb: (err: any) => void) => {
    if(!tasks.has(id)) {
        err_cb("no such job: " + id);
        return;
    }

    const do_logback = () => {
        fs.writeFile(`logs/job_${id}_${currentDate()}.log`, JSON.stringify(tasks.get(id)), err => {
            if(err == undefined) {
                ok_cb()
            } else {
                err_cb(err)
                logger.error(`Couldn't log back job ${id}:`, err)
            }

            tasks.delete(id)
        })
    }

    if(tasks.get(id)!.status.running)
        halt_job(id, err => err_cb(err), do_logback)
    else
        do_logback()
}
