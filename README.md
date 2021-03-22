# backuper

Backup daemon tool :
- Automatic
- Monitorable
- Encrypted backups
- Multi-backups definitions (directories, schedules, etc)
- Multi-repositories by backups
- Various providers supported (OVH, AWS, filesystem, etc)
- Fiable ?

## Warning

Even if most of the job is done by Restic (https://github.com/restic/restic), this tool is not a Restic frontend. Restic can be removed for another backup app without changing contracts or features of backuper.
