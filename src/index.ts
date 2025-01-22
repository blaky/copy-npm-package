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
    time: Record<string, string>;
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

}

interface CopyPackageVersionsOptions {
    from: string;
    to: string;
    fromToken?: string;
    toToken?: string;
    fromUsername?: string;
    fromPassword?: string;
    toUsername?: string;
    toPassword?: string;
    package: string;
    after?: Date;
}

export default async function copyPackageVersions({
    from,
    to,
    fromToken,
    toToken,
    fromUsername,
    fromPassword,
    toUsername,
    toPassword,
    package: packageName,
    after = new Date(0),
}: CopyPackageVersionsOptions) {

    const sourceRegistry = new RegistryConfig('Source registry', from, fromToken, fromUsername, fromPassword);
    const targetRegistry = new RegistryConfig('Target registry', to, toToken, toUsername, toPassword);

    const sourcePackageInfo = await axios.get<NpmRegistryPackageInfo>(sourceRegistry.getPackageUrl(packageName), {
        headers: sourceRegistry.getAuthHeaders(),
    });
    const targetPackageInfo = await axios.get<NpmRegistryPackageInfo>(targetRegistry.getPackageUrl(packageName), {
        headers: targetRegistry.getAuthHeaders(),
    });

    const packageVersionsToCopy = difference(Object.keys(sourcePackageInfo.data.versions), Object.keys(targetPackageInfo.data.versions));
    if (packageVersionsToCopy.length === 0) {
        console.log('No new versions to copy.');
        process.exit(0);
    }

    packageVersionsToCopy.sort();

    console.log(`Package versions to be copied:`);
    packageVersionsToCopy.forEach(version => console.log(`- ${version}`));

    for (const packageVersion of packageVersionsToCopy) {

        if (sourcePackageInfo.data.time[packageVersion] && new Date(sourcePackageInfo.data.time[packageVersion]) < after) {
            console.log(`Skipping ${packageVersion}. It was published on ${sourcePackageInfo.data.time[packageVersion]} which is before ${after.toISOString().substring(0, 10)}`);
            continue;
        }

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
        const tarballName = `${versionDetails.name.replace("/", "-").replace("@", "")}-${versionDetails.version}.tgz`;

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
                        integrity: versionDetails.dist.integrity,
                        shasum: versionDetails.dist.shasum,
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

        await axios.put(targetRegistry.getPackageUrl(packageName), payload, {
            headers: {
                'Content-Type': 'application/json',
                ...targetRegistry.getAuthHeaders(),
            },
        });
        console.log(`Uploaded ${packageVersion}.`);
    }
}