#!/usr/bin/env python3

import rpyc
import click
from tabulate import tabulate

def get_remote():
    conn = rpyc.connect("localhost", 18812, config={'allow_all_attrs': True, "allow_public_attrs":True, "sync_request_timeout": None})
    return conn.root

@click.group()
def cli():
    pass

@click.command(name='list-snapshots')
@click.argument('repository')
@click.option('--backup')
@click.option('--hostname')
def list_snapshots(repository, backup, hostname):
    snapshots = get_remote().list_snapshots(repository_name=repository, backup_name=backup, hostname=hostname)
    data = [['Date', "Id", "Hostname", "Backup"]]
    for snapshot in snapshots:
        backup_name = None
        for tag in snapshot['tags']:
            if tag[0:7] == 'backup-':
                backup_name = tag[7:]

        data.append([snapshot['time'], snapshot['id'], snapshot['hostname'], backup_name])
    click.echo(tabulate(data, tablefmt="github", headers="firstrow"))

@click.command(name='restore-snapshot')
@click.argument('repository')
@click.argument('snapshot')
@click.option('--target-path')
def restore_snapshot(repository, snapshot, target_path):
    get_remote().restore_snapshot(repository_name=repository, snapshot=snapshot, target_path=target_path)
    click.echo('Restore queued')


def download_snapshot():
    #restic -r /srv/restic-repo dump latest /home/other/work > restore.tar
    pass

cli.add_command(list_snapshots)
cli.add_command(restore_snapshot)
cli()
