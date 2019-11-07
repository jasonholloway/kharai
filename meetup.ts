import superagent, { Response } from 'superagent'
import cheerio from 'cheerio'
import createUpload from './upload'
import { Stream, Writable } from 'stream';
import zlib from 'zlib'
import { Config } from './config';
import { CookieAccessInfo, Cookie } from 'cookiejar';
import { S3 } from 'aws-sdk'

const superagentProxy = require('superagent-proxy')
superagentProxy(superagent);


export default (config: Config, s3: S3) => {

    const { upload } = createUpload(config, s3);

    const createAgent = (setup?: superagent.Plugin) => superagent
        .agent()
        .use(http => {
            http.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
                .set('User-Agent', 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:70.0) Gecko/20100101 Firefox/70.0')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Pragma', 'no-cache')
                .set('Cache-Control', 'no-cache')
                .set('Connection', 'keep-alive')
                .set('DNT', '1')
                .set('Upgrade-Insecure-Requests', '1');

            if(config.proxy) (<any>http).proxy(config.proxy);
            if(setup) setup(http);
        })

    type Agent = ReturnType<typeof createAgent>

    const getCookie = () => {
        const agent = createAgent();

        return visitMeetup(agent)
            .then(visitLogin(agent))
            .then(postLogin(agent))
            .then(() => agent.jar.getCookie('MEETUP_MEMBER', new CookieAccessInfo('.meetup.com', '/', true, false)).value)
    }

    const getMembers = (memberCookie: string) => {
        const agent = createAgent(req => 
            req.set('Cookie', [
                `MEETUP_MEMBER=${memberCookie}; Domain=.meetup.com; Path=/; Secure; HttpOnly`
            ]));

        // const gz = zlib.createGzip();
        const dataStr = new Stream.PassThrough();

        return Promise.all([
            upload(`M:${new Date().toISOString()}`, dataStr), ///.pipe(gz)),
            downloadMembers(agent)(dataStr)
        ]);
    }

    const visitMeetup = (http: Agent) =>
        http.get('https://www.meetup.com')
            .ok(r => r.status == 200)

    const visitLogin = (http: Agent) => () =>
        http.get('https://www.meetup.com/login/')
            .set('Host', 'www.meetup.com')
            .set('Referer', 'https://www.meetup.com/')
            .set('TE', 'Trailers')
            .ok(r => r.status == 200);

    const postLogin = (http: Agent) => (resp: Response) => {
        const $ = cheerio.load(resp.text);
        return http
            .post('https://secure.meetup.com/login/')
            .set('Host', 'secure.meetup.com')
            .set('Origin', 'https://secure.meetup.com')
            .set('Referer', 'https://secure.meetup.com/login/')
            .set('TE', 'Trailers')
            .type('form')
            .send({
                email: config.email,
                password: config.password,
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

    const downloadMembers = (http: Agent) => (str: Writable) =>
        http.get(`https://www.meetup.com/${config.groupName}/members/?op=csv`)
            .ok(r => r.status == 200 
                    && r.header['content-type'] == 'application/vnd.ms-excel;charset=UTF-8')
            .buffer(false)
            .parse((res, fn) => {
                const piped = res.pipe(str);
                piped.on('error', fn);
                piped.on('close', fn);
                piped.on('finish', fn);
            });

    return {
        getCookie,
        getMembers
    }
}