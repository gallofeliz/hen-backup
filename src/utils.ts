export function durationToSeconds(duration: string): number {
    const mapping = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400, 'w': 604800}
    return parseInt(duration.substring(0, -1), 10)  * mapping[duration.substr(-1).toLowerCase() as 's' | 'm' | 'h' | 'd' | 'w']
}

export function sizeToKiB(size: string): number {
    const mapping = {'k': 1, 'm': 1024, 'g': 1048576}
    return parseInt(size.substring(0, -1), 10)  * mapping[size.substr(-1).toLowerCase() as 'k' | 'm' | 'g']
}
