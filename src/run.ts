import commandLineArgs from 'command-line-args'
import copyPackageVersions from '.';


(async function () {
    const options = commandLineArgs([
        { name: 'from', type: String },
        { name: 'to', type: String },
        { name: 'from-token', type: String },
        { name: 'to-token', type: String },
        { name: 'from-username', type: String },
        { name: 'from-password', type: String },
        { name: 'to-username', type: String },
        { name: 'to-password', type: String },
        { name: 'package', type: String },
        { name: 'after', type: String },
        { name: 'only-latest-from-each-major', type: Boolean },
    ]);

    if (!options.from) {
        throw new Error(`Source registry: Must provide a URL`);
    }
    if (!options.to) {
        throw new Error(`Target registry: Must provide a URL`);
    }

    if (options['from-token'] && (options['from-username'] || options['from-password'])) {
        throw new Error(`Source registry: 'Cannot provide both token and username/password`);
    }

    if (options['to-token'] && (options['to-username'] || options['to-password'])) {
        throw new Error(`Target registry: 'Cannot provide both token and username/password`);
    }

    if (!options['from-token']) {
        if (!options['from-username'] || !options['from-password']) {
            throw new Error(`Source registry: Must provide either token or username/password`);
        }
    }

    if (!options['to-token']) {
        if (!options['to-username'] || !options['to-password']) {
            throw new Error(`Target registry: Must provide either token or username/password`);
        }
    }

    if (options.after && !options.after.match(/^\d{4}-\d{2}-\d{2}$/gm)){
        throw new Error(`After date must be in the format YYYY-MM-DD`);
    }

    await copyPackageVersions({
        from: options.from,
        to: options.to,
        fromToken: options['from-token'],
        toToken: options['to-token'],
        fromUsername: options['from-username'],
        fromPassword: options['from-password'],
        toUsername: options['to-username'],
        toPassword: options['to-password'],
        package: options.package,
        after: options.after ? new Date(options.after) : undefined,
        onlyLatestFromEachMajor: options['only-latest-from-each-major']
    })
})().catch(err => {
    console.error(err);
    process.exit(1);
})