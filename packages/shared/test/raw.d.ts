// Fixtures lidas como texto pelo Vite (`?raw`): o pacote não tem os tipos do Node.
declare module '*?raw' {
  const texto: string;
  export default texto;
}
