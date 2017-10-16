import PropTypes from 'prop-types';
import Head from 'next/head'
import CodeMirror from 'react-codemirror';
import CommandPalette from './CommandPalette';
import StatusBar from './StatusBar';

// Shame, SSR avoid hack
if (typeof navigator !== 'undefined') {
    require('codemirror/mode/markdown/markdown');
    require('codemirror/keymap/sublime');
    require('codemirror/addon/dialog/dialog');
    require('codemirror/addon/search/search');
    require('codemirror/addon/search/searchcursor');
    require('codemirror/addon/search/jump-to-line');
    require('codemirror/addon/edit/matchbrackets');
    require('codemirror/addon/edit/closebrackets');
    require('codemirror/addon/fold/foldcode');
    require('codemirror/addon/fold/foldgutter');
    require('codemirror/addon/fold/markdown-fold');
}

const SMOOTHSCROLL_ITERATIONS = 15;
const SMOOTHSCROLL_INTERVAL = 30;
const CURSOR_STRING = '@@@@@';


class Editor extends React.Component {
    constructor(props) {
        super(props);
        const defaultCmOptions = {
            scrollbarStyle: null,
            lineWrapping: true,
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            foldGutter: true,
            theme: 'ttcn',
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: {
                'Ctrl-P': 'jumpToLine',
                'Ctrl-Space': 'autocomplete',
                'Ctrl-Q': function (cm) { cm.foldCode(cm.getCursor());},
            },
            keyMap: 'sublime',
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleCursorActivity = this.handleCursorActivity.bind(this);
        this.scrollToPreviewCursor = this.scrollToPreviewCursor.bind(this);
        this.generateOutline = this.generateOutline.bind(this);
        this.handleOutlineClick = this.handleOutlineClick.bind(this);
        this.handleCommand = this.handleCommand.bind(this);
        const html = props.toHtml(props.content);
        const raw = props.content;
        this.state = {
            width: props.width,
            height: props.height,
            raw,
            html,
            outline: this.generateOutline(html),
            activeLine: 0,
            smoothScrollTimer: null,
            columns: {
                'editor': true,
                'preview': true,
                'outline': false,
            },
            loc: raw.split('\n').length,
            options: {
                mode: props.language,
                ...defaultCmOptions,
            },
        };
    }
    static propTypes = {
        content: PropTypes.string,
        language: PropTypes.string,
        toHtml: PropTypes.func,
        width: PropTypes.number,
        height: PropTypes.number,
    }
    static defaultProps = {
        content: '',
        language: 'markdown',
        toHtml: (src) => src,
        width: 500,
        height: 500,
    }
    componentDidMount() {
        document.querySelector('.CodeMirror').style.height = `${this.state.height}px`;
    }
    handleCommand(command) {
        const state = this.state;
        let substate = state;

        const commandPath = command.split('.');
        commandPath.slice(0, commandPath.length - 1).forEach(
            step => {
                substate = substate[step];
            }
        );
        const lastStep = commandPath[commandPath.length - 1];
        substate[lastStep] = !substate[lastStep];
        this.setState(state);
    }
    handleChange(value) {
        const html = this.props.toHtml(value);
        const raw = value;
        this.setState({
            raw,
            html,
            loc: raw.split('\n').length,
            outline: this.generateOutline(html),
        });
    }
    handleOutlineClick(heading) {
        const inCode = heading.content;
        const cm = this.refs.cmr.getCodeMirror();
        const value = cm.getValue();
        const pos = value.indexOf(inCode);
        const line = value.substr(0, pos).split('\n').length - 1;
        cm.setCursor(line);
        this.refs.cmr.focus();
    }
    generateOutline(html) {
        const outline = html
            .match(/<h[0-9][^<>]*>.*<\/h[0-9]>/g)
            .map(heading => {
                const [, level, id, content] = heading.match(/<h([0-9])[^<>]*id="(.*)"[^<>]*>(.*)<\/h[0-9]>/);
                return { content, level: +level, id, children: [], path: [] };
            })
            .reduce((acc, val) => {
                function insert(into, what, acc) {
                    if (into.children.length === 0 || what.level - into.level == 1) {
                        what.path.push(into.children.length - 1);
                        into.children.push(what);
                    } else if (into.level < what.level) {
                        what.path.push(into.children.length - 1);
                        insert(into.children[into.children.length - 1], what, acc);
                    }
                    else {
                        let anotherInto = acc[what.path[0]];
                        what.path.slice(1, what.path.length - 1).forEach(i => {
                            anotherInto = anotherInto.children[i];
                        });
                        anotherInto.children.push(what);
                    }
                }
                if (acc.length === 0) {
                    acc.push({ ...val, path: [0] });
                }
                else {
                    const lastHeading = acc[acc.length - 1];
                    const lastLevel = lastHeading.level;
                    if (val.level <= lastLevel) {
                        acc.push({ ...val, path: [acc.length - 1] });
                    } else {
                        val.path = [acc.length - 1];
                        insert(acc[acc.length - 1], val, acc);
                    }
                }
                return acc;
            }, []);

        return outline;
    }
    handleCursorActivity(cm) {
        let activeLine = cm.getCursor().line;
        if (this.state.activeLine !== activeLine) {
            let rawLines = this.state.raw.split('\n');
            let renderContext = false;
            // move up while line has no `context`
            while (!renderContext) {
                activeLine--;
                // context is string that gets rendered as string in html
                [, , renderContext] = this.props
                    .toHtml(rawLines[activeLine])
                    .replace('\n', '')
                    .match(/^(<.*>)*(\w+)/) || [];
            }

            rawLines[activeLine] = rawLines[activeLine]
                .replace(renderContext, `${renderContext}${CURSOR_STRING}`);

            this.setState({
                ...this.state,
                activeLine,
                html: this.props
                    .toHtml(rawLines.join('\n'))
                    .replace(CURSOR_STRING, '<span class="cursor">|</span>'),
            });
            this.scrollToPreviewCursor();
        }
    }
    scrollToPreviewCursor() {
        const previewCol = document.querySelector('.preview').parentElement;
        const previewCursor = document.querySelector('.preview .cursor');
        const centeringOffset = this.state.height/2.2;
        if (previewCol && previewCursor) {
            if (this.state.smoothScrollTimer) {
                window.clearInterval(this.state.smoothScrollTimer);
                previewCol.scrollTop = Math.max(0, previewCursor.offsetTop - centeringOffset)
            }

            const interval = setInterval(smoothScrollIteration.bind(this), SMOOTHSCROLL_INTERVAL);
            let iterations = 0;
            this.setState({
                ...this.state,
                smoothScrollTimer: interval,
            });
            function smoothScrollIteration() {
                const from = previewCol.scrollTop;
                const to = Math.max(0, previewCursor.offsetTop - centeringOffset);
                const goTo = from + (to - from) / 2;
                previewCol.scrollTop = goTo;
                iterations++;
                if (iterations >= SMOOTHSCROLL_ITERATIONS || Math.abs(goTo - to) < 2) {
                    previewCol.scrollTop = to;
                    clearInterval(interval);
                    this.setState({
                        ...this.state,
                        smoothScrollTimer: null,
                    });
                }
            }
        }
    }
    render() {
        const commandPaletteOptions = {
            'options.lineNumbers': 'Line numbers',
            'options.lineWrapping': 'Line wrapping',
            'columns.editor': 'Column editor',
            'columns.preview': 'Column preview',
            'columns.outline': 'Column outline',
        };
        const workspaceStyles = {
            width: `${this.state.width}px`,
            height: `${this.state.height}px`,
        }
        const markupEditorStyles = {
            width: `${this.state.width}px`,
        }
        return (
            <div>
                <Head>
                    <link rel="stylesheet" type="text/css" href="markup-editor/lib/codemirror.css" />
                    <link href="https://fonts.googleapis.com/css?family=Roboto|Roboto+Mono" rel="stylesheet" />
                    <link rel="stylesheet" type="text/css" href="markup-editor/theme/ttcn.css" />
                    <link rel="stylesheet" type="text/css" href="markup-editor/addon/dialog/dialog.css" />
                    <link rel="stylesheet" type="text/css" href="markup-editor/addon/fold/foldgutter.css" />
                </Head>
                <div
                    className="markup-editor"
                    onKeyDown={(e) => {
                        if (e.shiftKey && e.ctrlKey) {
                            switch (e.key) {
                                case 'p':
                                case 'P':
                                    e.preventDefault();
                                    this.refs.commandPalette.focus();
                                    console.log(this.refs.cmr.getCodeMirror().getSelection());
                            }
                        }
                    }}
                    style={markupEditorStyles}
                >
                    <CommandPalette
                        ref="commandPalette"
                        options={commandPaletteOptions}
                        onSelected={this.handleCommand}
                        onExit={() => {
                            this.refs.cmr.focus();
                        }}
                    />
                    <div className="workspace" style={workspaceStyles}>
                        {
                            this.state.columns.outline &&
                            <div className="column">
                                <ol>
                                    {this.state.outline.map((heading) => {
                                        function printList(h, index) {
                                            return (<li key={`${h.id}${index}`}>
                                                <a onClick={() => this.handleOutlineClick(h)}>{h.content}</a>
                                                {h.children.length > 0 &&
                                                    <ol key={`${h.id}${index}ol`}>
                                                        {h.children.map(printList.bind(this))}
                                                    </ol>
                                                }
                                            </li>);
                                        }
                                        return (
                                            printList.bind(this)(heading, 0)
                                        );
                                    })}
                                </ol>
                            </div>
                        }
                        {this.state.columns.editor &&
                            <div className="column">
                                <CodeMirror
                                    ref="cmr"
                                    onCursorActivity={this.handleCursorActivity}
                                    value={this.state.raw}
                                    onChange={this.handleChange}
                                    options={this.state.options}
                                />
                            </div>
                        }
                        {this.state.columns.preview &&
                            <div className="column">
                                <div
                                    className="preview"
                                    spellCheck="false"
                                    contentEditable onKeyPress={(e) => { e.preventDefault() }}
                                    dangerouslySetInnerHTML={{ __html: this.state.html }}
                                >
                                </div>
                            </div>
                        }
                    </div>
                    <StatusBar loc={this.state.loc} onCommandPalette={() => this.refs.commandPalette.focus()} />
                </div>
                <style jsx global>{`
                .CodeMirror {
                    font-family: 'Roboto Mono', monospace;
                }
                
                .markup-editor {
                    position: relative;
                    border: 1px solid #333;
                }
                .preview {
                    font-family: 'Roboto', sans-serif;
                    padding: 10px 60px;
                }
                .preview:focus {
                    outline: 0px solid transparent;
                }
                .preview > div {
                    padding: 0 50px 0 20px;
                }
                .preview .cursor {
                    visibility: hidden;
                    display: inline-block;
                    width: 0;
                    height: 0;
                }
                .markup-editor .workspace {
                    align-items: stretch;
                    display: flex;
                }
                .markup-editor .workspace > .column {
                    flex: 1;
                    overflow-y: scroll;
                    overflow-x: hidden;
                }
                .markup-editor .workspace > .column::-webkit-scrollbar {
                    width: 0;
                    background: transparent;
                }
                `}</style>
            </div>
        );
    }
}

export default Editor;
