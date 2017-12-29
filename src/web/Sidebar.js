import styled from 'styled-components'

export const Sidebar = styled.div`
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 256px;
  background: #000;
  color: #fff;
  font-family: Comic Sans MS, sans-serif;
  overflow: auto;
  overflow-x: hidden;
`
export const SidebarItem = styled.span`
  display: block;
  padding: 3px 8px;
`
export const SidebarModule = styled.span`
  color: #0f0;
`
export const SidebarNavHeader = styled.p`
  text-align: center;
  color: #888;
  font-weight: bold;
  margin: 0;
  padding: 8px;
`
export default Sidebar
