import Mustache from 'mustache';
import { Collector } from './Collector';
import { fileWikiLinks, formatData, invertData, invertDictionary } from './types';

export class Templator {
    notes: fileWikiLinks[] | undefined;
    data: Map<string, Map<string, formatData[]>> = new Map<string, Map<string, formatData[]>>();
    collectors: Collector[] | undefined;
    viewProps: any | undefined;

    constructor(files: fileWikiLinks[] | undefined = undefined,
        collectors: Collector[] | undefined = undefined) {
        this.notes = files;
        if (files != undefined && collectors != undefined) {
            collectors.forEach(collector =>
                this.data.set(collector.dataName, 
                    collector.extractAll(files))
            );
            this.collectors = collectors;
        }
        this.viewProps = {
            queryCount: 0,
            notes: this.notes,
            created: new Date(),
            modified: new Date(),
            on(){
                var view = this;
                return function(text: string, render: any) {
                    // query = {{`tag[filter]`}}
                    const query_end = text.indexOf("`}}") + 3
                    const when = text.substr(3, query_end - 6);
                    const changed : Date = view.modified;
                    return render(text) + ` --${when}-- ++${new Date(changed).getUTCDay()}++ **${new Date(view.created).getUTCDay()}**`;
                }
            },
            markdown_escape() {
                return function(text: string, render: any) {
                    return render(text).replace("(", "&lpar;").replace(")", "&rpar;");
                }
            },
            query_filter() {
                const view = this;
                return function(text: string, render: any) {
                    // query = {{`tag?sort(by)[filter]`}}
                    const query_extract = /^{{`(?<tag>\w+)(?:\?(?<fn>\w+)\((?<args>[\w\s,]*)\))*\/(?<filter>[^]*)\/`}}/;
                    const [, tag, fn, args, filter] = query_extract.exec(text) || [];

                    if(fn.toLocaleUpperCase() !== "SORT") {
                        return `{{\`unknown function: ${fn}\`}}`
                    }
                    const query_end = text.indexOf("`}}") + 3;
                    
                    let ntag = tag;
                    if (fn && fn.length > 0) {
                        const sorted = "s" + view.queryCount++;
                        Object.defineProperty(view, sorted, {
                            value: function() {
                                let comparator = function (a: { key: string; }, b: { key: string; }): 1 | -1 | 0 {
                                    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
                                };
                                if (args && args.length > 0) {
                                    // split string to find the argument
                                    const ccarg = args + ":"
                                    const cc = function(c: {key: string}) : string { return c.key.split(ccarg)[1] || "ZZZZZ"}
                                    comparator = function (a: { key: string; }, b: { key: string; }): 1 | -1 | 0 {
                                        return cc(a) < cc(b) ? -1 
                                            : cc(a) > cc(b) ? 1 : 0;
                                    };
                                }

                                return view[tag].sort(
                                   comparator);
                            }
                        }) 
                        ntag = sorted;                           
                    }

                    const rr = new RegExp(filter);
                    const filtered = "q" + view.queryCount++;
                    Object.defineProperty(view, filtered, {
                        value: function() {
                            return function(text: string, render: any) {
                                const result = render(text);
                                if (rr.test(result)) {
                                    return result;
                                }
                            }
                        }
                    })
                    const children = `{{#${ntag}}}{{#${filtered}}}${text.substr(query_end)}{{/${filtered}}}{{/${ntag}}}`;
                    return render(children);
                }
            }
        }
        collectors?.forEach(collector =>
            Object.defineProperty(this.viewProps, collector.dataName, 
                {value: [...this.data.get(collector.dataName)?.entries() ?? []].map(this.listToNamedTuple)},
            ));
    }

    listToNamedTuple(input: [string, formatData[]]) {
        return {key: input[0], value: input[1]};
    }

    enhance(template: string): string {
        return template
            // Escaped and non-escaped versions
            .replace(/{{{[``](\w+)}}}/g, "{{#markdown_escape}}{{{$1}}}{{/markdown_escape}}")
            .replace(/{{[``](\w+)}}/g, "{{#markdown_escape}}{{$1}}{{/markdown_escape}}")
            .replace(/{{[\?]([^}]+)}}/g, "{{#query_filter}}{{`$1`}}")
            .replace(/{{\/[\?](\w*)}}/g, "{{/query_filter}}")
/*            .replace(/{{[\@]([^}]+)}}/g, "{{#on}}{{`$1`}}")
            .replace(/{{\/[\@](\w+)}}/g, "{{/on}}")
*/            ;
    }
    
    render(template: string, created: Date | undefined = undefined, modified: Date | undefined = undefined): string {
        const view = this.viewProps ?? {};
        view.created = new Date(created ?? Date.now()).toISOString();
        view.modified = new Date(modified ?? Date.now()).toISOString();
        return Mustache.render(this.enhance(template), view);
    }
}

