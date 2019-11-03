import superagent, { Request, Response } from 'superagent'
import cheerio from 'cheerio'
import createUpload from './upload'
import { Stream, Readable, Writable } from 'stream';
import zlib from 'zlib'

const superagentProxy = require('superagent-proxy')
superagentProxy(superagent);

const groupName = <string>process.env.MEETUP_GROUP;
const email = <string>process.env.MEETUP_EMAIL;
const password = <string>process.env.MEETUP_PASSWORD;
const s3Bucket = <string>process.env.S3_BUCKET;

const { upload } = createUpload({ s3Bucket });

const agent = superagent
    .agent()
    .use(req => (<any>req).proxy('http://localhost:8080'));

const http = () => agent
    .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    .set('User-Agent', 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:70.0) Gecko/20100101 Firefox/70.0')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Pragma', 'no-cache')
    .set('Cache-Control', 'no-cache')
    .set('Connection', 'keep-alive')
    .set('DNT', '1')
    .set('Upgrade-Insecure-Requests', '1')

// Run:
//   LoadState |>
//     | Cookie ->
//         DownloadCsv |> 
//           | Success -> UploadCsv; Run
//           | Fail -> ClearCookie; Run
//     | None -> 
//         Login |>
//           | Success -> SaveCookie; Run
//           | Fail -> Run
//
// a loop of four paths, one common root, branching according to loaded state
// this is all so neat, except for the problem of controlling our delay
// we need a way to self-schedule our resumptions
// if the program were endlessly active obviously this would be easy
//
//

const main = () =>
    visitMeetup()
    .then(() => visitLogin())
    .then(r => postLogin(r))
    .then(() => {
        const gz = zlib.createGzip();
        const dataStr = new Stream.PassThrough();
        return Promise.all([
            upload(`M:${new Date().toISOString()}`, dataStr.pipe(gz)),
            downloadMembers(dataStr).then(() => gz.flush)
        ]);
    })
    .then(() => console.log('DONE!!!'))
    .catch(console.log)

const visitMeetup = () =>
    http()
        .get('https://www.meetup.com')
        .ok(r => r.status == 200)

const visitLogin = () =>
    http()
        .get('https://www.meetup.com/login/')
        .set('Host', 'www.meetup.com')
        .set('Referer', 'https://www.meetup.com/')
        .set('TE', 'Trailers')
        .ok(r => r.status == 200);

const postLogin = (resp: Response) => {
    const $ = cheerio.load(resp.text);
    return http()
        .post('https://secure.meetup.com/login/')
        .set('Host', 'secure.meetup.com')
        .set('Origin', 'https://secure.meetup.com')
        .set('Referer', 'https://secure.meetup.com/login/')
        .set('TE', 'Trailers')
        .type('form')
        .send({
            email,
            password,
            token: $('input[name=token]').attr('value'),
            submitButton: 'Log+in',
            returnUri: 'https://www.meetup.com/',
            op: 'login',
            rememberme: 'on',
            apiAppClientId: ''
        })
        .redirects(0)
        .ok(r => r.status == 302);
}

const downloadMembers = (str: Writable) =>
    http()
        .get(`https://www.meetup.com/${groupName}/members/?op=csv`)
        .ok(r => r.status == 200 
                && r.header['content-type'] == 'application/vnd.ms-excel;charset=UTF-8')
        .buffer(false)
        .parse((res, fn) => {
            const piped = res.pipe(str);
            piped.on('error', fn);
            piped.on('close', fn);
            piped.on('finish', fn);
        });

main();