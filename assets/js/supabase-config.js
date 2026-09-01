// LH Nail Supabase 云端同步配置
// 使用步骤：
// 1. 在 Supabase 后台创建项目
// 2. 复制 Project URL 和 anon public key 到下面
// 3. 在 Supabase SQL Editor 执行根目录的 supabase-schema.sql
// 4. 把 enabled 改成 true 后重新部署 Netlify
window.LH_SUPABASE_CONFIG = {
  enabled: true,
  url: 'https://ntrjkbqubtrlklcutgim.supabase.co',
  anonKey: 'sb_publishable_rAUjbFJgf0vuqNbsNfvdIA_h6lXDPAs',
  workspaceId: 'lh-nail-main',
  table: 'lh_nail_sync'
};
