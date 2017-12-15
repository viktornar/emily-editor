import React from 'react';
import PropTypes from 'prop-types';
import { formatShortcut } from '../helpers/helpers';

class StatusBar extends React.PureComponent {
    static propTypes = {
      loc: PropTypes.number,
      commandPaletteCommand: PropTypes.shape({
        bindKey: PropTypes.object,
        text: PropTypes.string,
        execute: PropTypes.func,
      }).isRequired,
      line: PropTypes.number,
      col: PropTypes.number,
      autosaved: PropTypes.instanceOf(Date),
    }
    static defaultProps = {
      loc: 0,
      line: 1,
      col: 1,
      autosaved: null,
    }
    render() {
      const cpCommand = this.props.commandPaletteCommand;
      const buttonTitle = `${cpCommand.text} (${formatShortcut(cpCommand.bindKey, true)})`;
      return (
        <div className="statusBar">
          <div className="left">
            <button title={buttonTitle} className="command" onClick={cpCommand.execute}>Command</button>
            <span>{this.props.loc} Lines</span>
          </div>
          <div className="right">
            <span>
              {this.props.autosaved && `Autosaved ${this.props.autosaved.toLocaleTimeString()}`}
            </span>
            <span>
              {this.props.line}:{this.props.col}
            </span>
          </div>
          <style jsx>{`
                    .statusBar {
                        height: 20px;
                        background: #eee;
                        color: #aaa;
                        font-size: 13px;
                        line-height: 20px;
                        font-family: inherit;
                        position: absolute;
                        bottom: 0;
                        z-index: 100;
                        width: 100%;
                    }
                    .statusBar span {
                      margin: 0 10px;
                      cursor: default;
                    }
                    .statusBar button,
                    .statusBar button:focus {
                        outline: none;
                    }
                    button.command {
                      padding-left: 15px;
                    }
                    button.command::before {
                      content: '$';
                      position: absolute;
                      left: 4px;
                      bottom: 3px;
                    }
                    .statusBar button {
                        font-family: inherit;
                        border: none;
                        background: none;
                        color: #555;
                        cursor: pointer;
                        height: 20px;
                        position: relative;
                    }
                    .statusBar button:hover {
                        background: rgba(0,0,0,0.05);
                    }
                    .statusBar .left {
                        float: left;
                    }
                    .statusBar .right {
                        float: right;
                    }
                `}
          </style>
        </div>
      );
    }
}

export default StatusBar;
