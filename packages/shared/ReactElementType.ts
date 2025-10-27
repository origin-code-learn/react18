export type Source = {
    fileName: string;
    lineNumber: number;
}

export type ReactElement = {
    $$typeof: any;
    type: any;
    key: any;
    ref: any;
    props: any;
    _owner: any;
    _store: { validated: boolean, [key: string]: any };
    _self: ReactElement;
    _shadowChildren: any;
    _source: Source
}
