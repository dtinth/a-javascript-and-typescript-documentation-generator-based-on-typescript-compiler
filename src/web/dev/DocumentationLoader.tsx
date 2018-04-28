import * as React from 'react'

export default class DocumentationLoader extends React.Component<any, any> {
  state = { data: 'Loading...' }

  async componentDidMount () {
    try {
      const json = await window.fetch('/docs-data').then(res => res.json())
      this.setState({ data: json })
    } catch (e) {
      this.setState({ data: e.stack })
      setTimeout(() => { throw e })
    }
  }
  render () {
    return this.props.render(this.state.data)
  }
}
