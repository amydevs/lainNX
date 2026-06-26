declare global {
    // make .map() preserve tuple length
    interface Array<T> {
        map<U>(
            callbackfn: (value: T, index: number, array: T[]) => U,
            this_arg?: any,
        ): { [K in keyof this]: U };
    }
    var document: {
        hidden: true;
    }
}

declare var localStorage: Storage;

export {};
