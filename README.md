![GoIndex](https://raw.githubusercontent.com/donwa/goindex/master/themes/logo.png)  

> update 2020-3-9 :
- flac file play support

> update 2020-3-7 :  
- 添加搜索功能，搜索结果分页增量展示，并支持跳转到对应路径浏览
- 搜索功能支持个人盘和团队盘全盘搜索
- 搜索分页大小可配置，具体见 `index.js` 注释
- 尝试解决移动端滚动到底部时的增量加载问题
- UI优化，盘符选择改为下拉框展示

> update 2020-3-5 :  
- 文件列表页分页增量加载，支持自定义分页大小，多页内容的可以缓存，配置见 `index.js` 注释
- 图片浏览页 下一张/上一张 导航
- 优化列目录时的速度

> update 2020-3-4 :  
> 在原版基础上修改：
- 添加多盘支持，自主设置要显示的多盘及各自密码
- 前端只修改了 material ，故不支持 classic 主题
- 配置见 `index.js` 注释
  
GoIndex  
====  
Google Drive Directory Index  
Combining the power of [Cloudflare Workers](https://workers.cloudflare.com/) and [Google Drive](https://www.google.com/drive/) will allow you to index you files on the browser on Cloudflare Workers.    

`index.js` is the content of the Workers script.  

## Demo  
material: [https://index.gd.workers.dev/](https://index.gd.workers.dev/)  
classic: [https://indexc.gd.workers.dev/](https://indexc.gd.workers.dev/)  

## Deployment  
1.Install `rclone` software locally  
2.Follow [https://rclone.org/drive/]( https://rclone.org/drive/) bind a drive  
3.Execute the command`rclone config file` to find the file `rclone.conf` path  
4.Open `rclone.conf`,find the configuration `root_folder_id` and `refresh_token`  
5.Download index.js in https://github.com/donwa/goindex and fill in root and refresh_token  
6.Deploy the code to [Cloudflare Workers](https://www.cloudflare.com/)

## Quick Deployment  
1.Open https://installen.gd.workers.dev/  
2.Auth and get the code  
3.Deploy the code to [Cloudflare Workers](https://www.cloudflare.com/)  



## About  
Cloudflare Workers allow you to write JavaScript which runs on all of Cloudflare's 150+ global data centers.  
