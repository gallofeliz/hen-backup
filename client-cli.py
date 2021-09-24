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
@click.option('-r', '--repository')
@click.option('-b', '--backup')
@click.option('-h', '--hostname')
@click.option('-s', '--sort', default="Date")
@click.option('-n', '--reverse', default=False, is_flag=True)
def list_snapshots(repository, backup, hostname, sort, reverse):
    snapshots = get_remote().list_snapshots(
        repository_name=repository.lower() if repository else None,
        backup_name=backup.lower() if backup else None,
        hostname=hostname.lower() if hostname else None,
        sort=sort,
        reverse=reverse
    )
    if not len(snapshots):
        click.echo('No snapshots')
        return
    click.echo(tabulate(snapshots, headers="keys", tablefmt="github"))

@click.command(name='restore-snapshot')
@click.argument('repository')
@click.argument('snapshot')
@click.option('-d', '--target-path')
@click.option('-p', '--priority', type=click.Choice(['normal', 'next', 'immediate']), default='normal')
@click.option('-w', '--wait-done/--no-wait-done', default=False)
#@click.option('--force-run-on-timeout')
def restore_snapshot(repository, snapshot, target_path, priority, wait_done):
    get_remote().restore_snapshot(
        repository_name=repository.lower(),
        snapshot=snapshot,
        target_path=target_path,
        priority=priority,
        get_result=wait_done
    )
    if wait_done:
        click.echo('Restore ended')
    else:
        click.echo('Restore requested')

@click.command(name='check-repository')
@click.argument('repository')
@click.option('-p', '--priority', type=click.Choice(['normal', 'next', 'immediate']), default='normal')
def check_repository(repository, priority):
    get_remote().check_repository(
        repository_name=repository.lower(),
        priority=priority
    )

    click.echo('Check requested')

@click.command(name='backup')
@click.argument('backup')
@click.option('-p', '--priority', type=click.Choice(['normal', 'next', 'immediate']), default='normal')
@click.option('-w', '--wait-done/--no-wait-done', default=False)
def backup(backup, priority, wait_done):
    get_remote().backup(
        backup_name=backup.lower(),
        priority=priority,
        get_result=wait_done
    )
    if wait_done:
        click.echo('Backup ended')
    else:
        click.echo('Backup requested')

def prune(backup, priority, wait_done):
    get_remote().prune(
        backup_name=backup.lower(),
        priority=priority,
        get_result=wait_done
    )
    if wait_done:
        click.echo('Prune ended')
    else:
        click.echo('Prune requested')


def download_snapshot():
    #restic -r /srv/restic-repo dump latest /home/other/work > restore.tar
    pass

cli.add_command(list_snapshots)
cli.add_command(restore_snapshot)
cli.add_command(check_repository)
cli.add_command(backup)
cli()
