# backuper

Backup daemon tool :
- Automatic
- Monitorable
- Encrypted backups
- Multi-backups definitions (directories, schedules, etc)
- Multi-repositories by backups
- Various providers supported (OVH, AWS, filesystem, etc)
- Fiable ?

## Use

See docker-compose.yml

Notes :
- Multiple repositories are configurable
- Multiple backups are configurable and linked to one or multiple repositories
- Backups are schedulable by durations (ex 5m, 1h, 12h, 1d, etc), and/or cron (ex `*/15 * * * *`), and/or watching changes

So you can :
- Define multiple backups, for example 1 for each application ; Or with NFS, one for each machine (in a network)
- Define multiple repositories for your backup, for example 1 in OVH Paris and 1 in AWS Australia (if one is burnt...)
- A mix of that, for example app1 backup each day in OVH Paris and each week in AWS Australia, and app2 smaller each day in both, etc

I hope this tool will be good for me ahah

## Warning

Even if most of the job is done by Restic (https://github.com/restic/restic), this tool is not a Restic frontend. Restic can be removed for another backup app without changing contracts or features of backuper.
