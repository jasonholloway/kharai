import csv from 'csv-parse'
import getStream from 'get-stream'
import { Readable } from 'stream';
import dateFormat from 'date-fns/format'

const string = (v: any): string => {
    if(typeof v !== 'string') throw Error(`${v} is not a string!!!`)
    return v;
}

const dateOnly = (s: string) =>
    s ? dateFormat(new Date(s + ' UTC'), 'yyyy-MM-dd') : undefined;


const added = (m: any) => [
    'added', m.id,
        {
            name: string(m['Name']),
            loc: string(m['Location']),
            join: dateOnly(m['Joined Group on']),
            visitLast: dateOnly(m['Last visited group on']),
            attendLast: dateOnly(m['Last Attended']),
            attendTotal: Number.parseInt(m['Meetups attended'])
        }] as const

const left = (m: any) => [
    'left', m.id
    ] as const

const changed = (id: number, name?: string, loc?: string) => [
    'changed', id,
        {
            ...(name ? { name }: {}),
            ...(loc ? { loc } : {})
        }] as const

const visited = (id: number, date: string) => [
    'visited', id, date
    ] as const;

const attended = (id: number, date: string) => [
    'attended', id, date
    ] as const;

type Update = ReturnType<
      typeof added 
    | typeof left 
    | typeof changed 
    | typeof visited 
    | typeof attended>


const parse = () => csv({ delimiter: '\t', columns: true, skip_empty_lines: true });

export function diffMembers(s1: Readable, s2: Readable): Promise<Iterable<Update>> {
    return Promise.all([
        getStream.array(s1.pipe(parse())),
        getStream.array(s2.pipe(parse()))
    ])
    .then(([r1, r2]) => diffAll(r1, r2))
}

function *diffAll(r1: any[], r2: any[])
{
    const updates: Update[] = [];

    const before = sortById(r1);
    const after = sortById(r2);

    let iA = 0, iB = 0;
    while(true) {
        const a = before[iA], b = after[iB];

        if(!a && !b) {
            break;
        }

        if((!a && b) || (b && (b.id < a.id))) {
            yield added(b);
            iB++;
            continue;
        }

        if((a && !b) || (a && (a.id < b.id))) {
            yield left(a);
            iA++;
            continue;
        }

        for(const update of diffProps(a, b)) {
            yield update;
        }

        iA++; iB++;
    }

    return updates;

    function sortById(r: any[]) {
        return r.map((i: any) => ({ ...i, id: parseInt(i['Member ID']) }))
            .sort((a, b) => a.id - b.id) 
    }

    function *diffProps(a: any, b: any)
    {
        if(hasChanged('Name') || hasChanged('Location')) {
            yield changed(parseInt(b['Member ID']), 
                hasChanged('Name') && b['Name'], 
                hasChanged('Location') && b['Location'])
        }

        if(hasChanged('Last visited group on')) {
            yield visited(parseInt(b['Member ID']), 
                <string>dateOnly(b['Last visited group on']))
        }

        if(hasChanged('Last Attended')) {
            yield attended(parseInt(b['Member ID']), 
                <string>dateOnly(b['Last Attended']))
        }

        function hasChanged(p: string) {
            return a[p] !== b[p]
        } 
    }
}
