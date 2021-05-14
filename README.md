# backuper

Backup tool :
- Automatic
- Monitorable (logs are json and written to be collected and produce metrics to have supervision)
- Encrypted backups (restic)
- Multi-backups definitions (directories, schedules, etc)
- Multi-repositories by backups
- Various providers supported (OVH, AWS, filesystem, etc)
- One-main-thead operations to keep control on resources usage (CPU, bandwith) and avoid locking problems ; but will come priorities to have control on the queue and be able to run some operations in parallel
- Fiable ?
- Bandwidth by backups/operations
- Priorities (immediate/next/normal) by backups and operations
- Yml config ! With ability to declare repositories in a repositories section or under backups section (for ex for 1 repository for 1 backup definition)

Coming :
- Maybe Priorities "timeout" : After a configured time, a queued backup or operation will be running immedialty
- Keep policies to remove old backups and prune the repositories

## Use

See docker-compose.yml ane config_test.yml

Notes :
- Multiple repositories are configurable
- Multiple backups are configurable and linked to one or multiple repositories
- Backups are schedulable by durations (ex 5m, 1h, 12h, 1d, etc), and/or cron (ex `*/15 * * * *`), and/or watching changes

So you can :
- Define multiple backups, for example 1 for each application ; Or with NFS, one for each machine (in a network)
- Define multiple repositories for your backup, for example 1 in OVH Paris and 1 in AWS Australia (if one is burnt...)
- A mix of that, for example app1 backup each day in OVH Paris and each week in AWS Australia, and app2 smaller each day in both, etc

I hope this tool will be good for me ahah

## Interraction

You can use the CLI client to interract with the daemon :
- `sudo docker-compose exec backup client list-snapshots my-repository`
- `sudo docker-compose exec backup client restore-snapshot my-repository snapshot_sha --priority next`

## Warning

Even if most of the job is done by Restic (https://github.com/restic/restic), this tool is not a Restic frontend. Restic can be removed for another backup app without changing contracts or features of backuper.
