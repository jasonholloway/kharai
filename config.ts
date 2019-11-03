
const config = {
    tableName: 'dotnetnorth-state',
    groupName: <string>process.env.MEETUP_GROUP,
    email: <string>process.env.MEETUP_EMAIL,
    password: <string>process.env.MEETUP_PASSWORD,
    s3Bucket: <string>process.env.S3_BUCKET,
    proxy: 'http://localhost:8080'
}

export type Config = typeof config;
export default config;
