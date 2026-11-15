import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CalciteButton, CalciteNotice } from '@esri/calcite-components-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected rendering error' };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FlowWatch Africa ErrorBoundary:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-xl mx-auto">
          <CalciteNotice open kind="danger" icon="exclamation-mark-triangle">
            <div slot="title">FlowWatch Africa Interface Recovery</div>
            <div slot="message">{this.state.message}</div>
            <CalciteButton
              slot="link"
              scale="s"
              onClick={() => this.setState({ hasError: false, message: '' })}
            >
              Reload Workspace
            </CalciteButton>
          </CalciteNotice>
        </div>
      );
    }
    return this.props.children;
  }
}
