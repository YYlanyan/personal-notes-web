import express from 'express';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkspace } from './workspace.mjs';
import { seedPublicWorkspace } from './public.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(here,'..');
const integratedRoot=path.resolve(projectRoot,'..');
const isIntegratedWorkspace=['.git','notes','assets','public-notes','package.json'].every(name=>existsSync(path.join(integratedRoot,name)));
const defaultRoot=isIntegratedWorkspace?integratedRoot:projectRoot;
export const root=path.resolve(process.env.NOTES_ROOT || defaultRoot);
export const dataRoot=path.resolve(process.env.NOTES_DATA_ROOT || (process.env.NOTES_ROOT?root:defaultRoot));
export async function createApp({dev=false}={}) {
  const app=express();
  app.disable('x-powered-by');
  let settings={};
  try{settings=JSON.parse(await fs.readFile(path.join(dataRoot,'.local/workspaces.json'),'utf8'));}catch{}
  const blogRoot=process.env.NOTES_BLOG_ROOT || settings.blogRoot;
  const imgbedConfigPath=path.join(dataRoot,'.local/imgbed.json');
  const workspaces=[{id:'notes',name:'私人笔记',root,contentDir:'notes',kind:'notes',available:true}];
  let blogRouter;
  if(blogRoot) {
    try {
      blogRouter=await createWorkspace({root:path.resolve(blogRoot),localDir:path.join(dataRoot,'.local/blog'),isBlog:true,imgbedConfigPath});
      workspaces.push({id:'blog',name:'博客',root:blogRoot,contentDir:'content',kind:'hugo',available:true,siteUrl:'https://yylanyan.github.io/',repositoryUrl:'https://github.com/YYlanyan/YYlanyan.github.io'});
    } catch(error) {workspaces.push({id:'blog',name:'博客',available:false,error:error.message});}
  }
  const publicDirectory=path.join(dataRoot,'public-notes'),publicNotes=path.join(publicDirectory,'notes'),publicState=path.join(dataRoot,'.local/public-notes/state'),publicRepo=path.join(dataRoot,'.local/public-notes/repo');
  let publicRouter;
  try {
    await seedPublicWorkspace(publicDirectory,publicState);
    publicRouter=await createWorkspace({root:publicRepo,notesDir:publicNotes,assetsDir:path.join(publicDirectory,'assets'),localDir:publicState,isPublic:true,imgbedConfigPath});
    workspaces.push({id:'public',name:'公开笔记',root:publicDirectory,contentDir:publicNotes,kind:'public-notes',available:true,repositoryUrl:'https://github.com/YYlanyan/personal-notes-web'});
  } catch(error) {workspaces.push({id:'public',name:'公开笔记',available:false,error:error.message});}
  app.get('/api/workspaces',(req,res)=>{
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||''))return res.sendStatus(403);
    res.setHeader('Cache-Control','no-store');res.json({workspaces});
  });
  if(blogRouter)app.use('/workspaces/blog',blogRouter);
  if(publicRouter)app.use('/workspaces/public',publicRouter);
  app.use(await createWorkspace({root:dataRoot,localDir:path.join(dataRoot,'.local'),imgbedConfigPath}));
  app.use('/vendor/vditor',express.static(path.join(here,'node_modules/vditor')));
  if(dev){const {createServer}=await import('vite');const vite=await createServer({root:here,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
  else{app.use(express.static(path.join(here,'dist')));app.get('/{*any}',(req,res)=>res.sendFile(path.join(here,'dist/index.html')));}
  return app;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4317),app=await createApp({dev:process.argv.includes('--dev')});
  const server=app.listen(port,'127.0.0.1');
  server.on('listening',()=>console.log(`Notes is ready at http://127.0.0.1:${port}`));
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用，请打开现有 Notes 或选择其他 PORT。`:error.message);process.exitCode=1;});
}
