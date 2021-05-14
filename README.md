# Hen-Backup

Hen-Backup is a backup tool designed to be automatic, complete and flexible. Its values are :
- Automatic (Daemon)
- Monitorable (logs are json and written to be collected and produce metrics to have supervision)
- Encrypted
- Unlimited backups definitions (define a backup for a database, other for your music, other for your pictures, etc)
- Unlimited repositories definitions, for one or multi backups
- Multi providers support (OVH, AWS, filesystem, etc)
- Resources limitation for guys like me that have a slow internet ;) and slow computer

Backup uses Restic for operations. It's like a Restic supervisor !

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

You can use the CLI client to interract with the daemon :
- `sudo docker-compose exec backup client list-snapshots ovh-frankfort -b grafana` will list all the grafana snapshots on OVH Frankfort
- `sudo docker-compose exec backup client restore-snapshot aws-ireland-pictures snapshot_sha --priority next`

## Warning

Even if most of the job is done by Restic (https://github.com/restic/restic), this tool is not a Restic frontend. Restic can be removed for another backup app without changing contracts or features of Hen-Backup, and some Restic logics can be overrided by mine.
