const baseRename = () => {
    let tempBase = null;
    let realBase = null;
    return {
        name: 'base-rename-plugin',
        config(config) {
            tempBase = config.base.replace(":/", "://");
            realBase = config.base;
            return {
                base: tempBase
            };
        },
        generateBundle(options, bundle) {
            for (const file of Object.values(bundle)) {
                if (file.type === 'chunk') {
                    file.code = file.code.replaceAll(tempBase, realBase);
                }
                else if (file.type === 'asset' && typeof file.source === 'string') {
                    file.source = file.source.replaceAll(tempBase, realBase);
                }
            }
        },
    }
}

export default baseRename;