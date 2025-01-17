import commandLineArgs from 'command-line-args'
import axios, { RawAxiosRequestHeaders } from 'axios';
import { trimEnd, difference } from 'lodash';

interface NpmRegistryPackageVersionInfo {
    _id: string;
    name: string;
    version: string;
    description: string;
    main: string;
    dist: {
        tarball: string;
        integrity: string;
        shasum: string;
    }
}

interface NpmRegistryPackageInfo {
    _id: string;
    rev: string;
    name: string;
    versions: Record<string, NpmRegistryPackageVersionInfo>;
}

class RegistryConfig {

    public readonly url: string;

    constructor(private readonly name: string, url: string, public readonly token?: string, public readonly username?: string, public readonly password?: string) {
        if (!url) {
            throw new Error(`${name}: Must provide a URL`);
        }

        if (token && (username || password)) {
            throw new Error(`${name}: 'Cannot provide both token and username/password`);
        }

        if (!token) {
            if (!username || !password) {
                throw new Error(`${name}: Must provide either token or username/password`);
            }
        }

        this.url = trimEnd(url, '/');
    }

    getAuthHeaders(): RawAxiosRequestHeaders {
        if (this.token) {
            return {
                Authorization: `Bearer ${this.token}`
            };
        }

        return {
            Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`
        }
    }

    getPackageUrl(packageName: string): string {
        return `${this.url}/${encodeURIComponent(packageName)}`;
    }

    getPackageTarballUrl(packageName: string, version: string): string {
        // "https://pkgs.dev.azure.com/Sage-LiveServices/_packaging/Sage-ERP/npm/registry/@sage/xtrem-ui/-/xtrem-ui-51.0.19.tgz
        return `${this.url}/${encodeURIComponent(packageName)}/-/${packageName}-${version}.tgz`;
    }
}

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
        { name: 'package', type: String }
    ]);

    if (!options.from || !options.to) {
        console.error('Missing required arguments: from and to');
        process.exit(1);
    }

    const sourceRegistry = new RegistryConfig('Source registry', options.from, options['from-token'], options['from-username'], options['from-password']);
    const targetRegistry = new RegistryConfig('Target registry', options.to, options['to-token'], options['to-username'], options['to-password']);

    const sourcePackageInfo = await axios.get<NpmRegistryPackageInfo>(sourceRegistry.getPackageUrl(options.package), {
        headers: sourceRegistry.getAuthHeaders(),
    });
    const targetPackageInfo = await axios.get<NpmRegistryPackageInfo>(targetRegistry.getPackageUrl(options.package), {
        headers: targetRegistry.getAuthHeaders(),
    });

    const packageVersionsToCopy = difference(Object.keys(sourcePackageInfo.data.versions), Object.keys(targetPackageInfo.data.versions));
    if (packageVersionsToCopy.length===0){
        console.log('No new versions to copy');
        process.exit(0);
    }
    console.log(`Package versions to be copied:`);
    packageVersionsToCopy.forEach(v => console.log(v));

    for (const packageVersion of packageVersionsToCopy) {
        console.log(`Downloading ${packageVersion}...`);
        const versionDetails = sourcePackageInfo.data.versions[packageVersion];
        const downloadedPackage = await axios.get(versionDetails.dist.tarball, {
            headers: sourceRegistry.getAuthHeaders(),
            responseType: 'arraybuffer',
        });
        console.log(`Downloaded ${packageVersion}.`);

        const base64EncodedPackageContent = Buffer.from(downloadedPackage.data, 'binary').toString('base64');

        console.log(`Uploading ${packageVersion}...`);

        // Read the tarball (created with `npm pack` or similar tool)
        const tarballName = `${versionDetails.name.replace('/', '-').replace('@', '')}-${versionDetails.version}.tgz`;

        // Build the payload
        const payload = {
            _id: versionDetails.name,
            name: versionDetails.name,
            description: versionDetails.description || '',
            'dist-tags': { latest: versionDetails.version },
            versions: {
                [versionDetails.version]: {
                    ...versionDetails,
                    dist: {
                        tarball: `${sourceRegistry.getPackageUrl(versionDetails.name)}/-/${tarballName}`,
                    },
                },
            },
            _attachments: {
                [tarballName]: {
                    content_type: 'application/octet-stream',
                    data: base64EncodedPackageContent,
                },
            },
        };

        await axios.put(targetRegistry.getPackageUrl(options.package), payload, {
            headers: {
                'Content-Type': 'application/json',
                ...targetRegistry.getAuthHeaders(),
            },
        });
        console.log(`Uploaded ${packageVersion}.`);
    }

})().catch(console.error)