# Hen-Backup

![](https://github.com/gallofeliz/hen-backup/blob/03dc82560c826dd5546d087aa4c9f7404897ba01/Capture%20du%202021-11-04%2001-29-57.png)

Hen-Backup is a backup tool designed to be automatic, complete and flexible. Its values are :
- Automatic (Daemon)
- Monitorable (logs are json and written to be collected and produce metrics to have supervision)
- Encrypted
- Unlimited backups definitions (define a backup for a database, other for your music, other for your pictures, etc)
- Unlimited repositories definitions, for one or multi backups. Note that repositories are not redundancy. You can have redundancy with a RAID, a cloud provider, etc. Repositories are not connected and there will have n snapshots, with different dates, different ids, etc. We can imagine in the futur different rentention policies or others differences, but for that for the moment better use two backup definitions (different paths, rentention policies, etc are exactly what is a backup definition !)
- Multi providers support (OVH, AWS, filesystem, etc)
- Resources limitation for guys like me that have a slow internet ;) and slow computer

Backup uses Restic for operations. It's like a Restic supervisor !

Notes : The daemon is chrooted on its hostname. Restic is used and able to do everything crazy, but globally for me it's not a very good idea to store every devices in the same repository (yes, it depends of the situation, but what I don't like it's that everybody can see everybody and delete others, especially in case of intrusion). And so, we will not develop a factory to handle external repositories, others hostname, etc. So the idea is to chroot ! If you want to manage other hostname, please call the api of its daemon, or run a daemon (todo add "readonly/recovery" mode) to operate on it.

As Restic is used as tool, the "super" maintenance has to been done directly with Restic.

## Limitations

Currently the code doesn't use iterators, and can suffer of big amounts of data on some operations (search snapshots, get snapshot description etc). These limitations are not "in-design" and so can be fixed. However, nothing better than Restic can do can be done.

## Use

See docker-compose.yml and config_test.yml

For example :
- Configure a backup of your pictures each time they change (add, rename, delete, etc) and minimum each day. You will choose AWS Ireland because you love AWS, but what happens if the datacenter burn ? Configure a second repository for your backup ! Choose another location and why not another provider : OVH. OVH in frankfort ? So you will backup in AWS Ireland and OVH Frankfort each time you change your file.
- Now you want to backup your grafana database. On change ? No, too often. Each hour. But wait ... The database can change and the backup is not good on an open database. You can configure a new backup for your database with a hook before : call a webservice that will dump your database every hour before your backup !

Notes:
- You can share a repository with different backups ;
- You can add latencies to watchers to avoid to backup on the first change, and try to wait until the change ends.
- You can define priorities (for example grafana backup can be more important than your pictures)
- You can define bandwith limitations for each backup : grafana is very important, so should use all the bandwith, but you don't want your pictures to freeze your Netflix movie.

## Interraction

A WebUI can be used, and the Daemon is callable with an API to make operations. The API is the new and unique way to communicate with the Daemon.

## Doc

There is no doc because it is a personal project. Notes :
- schedules are units based (5s, 5m, 5h, 5d, 5w) or cron (seconds can be controled), and multiple values are possible
- priorities are : immediate (now), next (first position of the queue), superior, normal, inferior, on-idle (last position of the queue) or arbitrary integer (normal == 0, superior > int < inferior)
- hook onfailure are ignore (will no impact), continue (continue the process but will be marked as failed), or break (you understand)
- Bandwith limits are units based (50K, 50M, etc)
- repositories are global or local. But the name is always local (add a prefix was an idea but can add confusion and/or nomenclature problems)

## Warning

Even if most of the job is done by Restic (https://github.com/restic/restic), this tool is not a Restic frontend. Restic can be removed for another backup app without changing contracts or features of Hen-Backup, and some Restic logics can be overrided by mine.

## Logs refactoring

- There are some triggers : scheduling, files watching, cli, ui
- There are some tasks/actions : backup, prune, check repo, etc
- The flow is : a trigger requests an action as task, and this task is added to a queue.

It should be good to scope everything inside that. Maybe an extendable logger with "nodes" of "parent". trigger > action > subaction > restic.

treenodes was a idea but I am not sure it's really the solution. Every thinks (trigger, action, etc) should have like "identity". And the base is the action/task. So the task should be linked to that, maybe the task exec should receive args like logger, I don't know.

And Restic can stays a long time "frozen". Maybe should be good to have tasks and/or restic logs each x time to recorder what happens (like 5 tasks in queue, 1 running, etc).

## Web UI instead of cli ?

Should be user friendly :)

## Ideas

- Refacto with node to be simpler ?
- Add read-only/mainteance mode to mount a backup daemon (for example server2) to fetch some infos or recovery it without making backup
- Add in UI hightlight on backup column for unknown backup definition (+ ability to delete them)
- Add x concurrent jobs with collisions detection ?
- Add a max time for a job/backup to avoid to freeze the jobs in queue ?
- Add warnings in Job shown in the UI to see warnings (for example failed pre-hook ?)
- Add progress for Job
- Add "steps" in Job ?
