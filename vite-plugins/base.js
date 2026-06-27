const basePlugin = ({ base }) => {
    const tempBase = "/DO_NOT_USE_BASE_PATH";
    return {
        name: 'base-plugin',
        config(config) {
            return {
                base: tempBase,
            }
        },
        generateBundle(options, bundle) {
            for (const file of Object.values(bundle)) {
                console.log(file.type)
                if (file.type === 'chunk') {
                    file.code = file.code.replaceAll(tempBase, base);
                }
                else if (file.type === 'asset' && typeof file.source === 'string') {
                    file.source = file.source.replaceAll(tempBase, base);
                }
            }
    }
    }
}
export default basePlugin;