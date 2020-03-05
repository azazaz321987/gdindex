var authConfig = {
    "siteName": "GoIndex", // 网站名称
    "version": "20.03.04", // 程序版本
    // 此版本只支持 material
    "theme": "material", // material  classic
    "client_id": "202264815644.apps.googleusercontent.com",
    "client_secret": "X4Z3ca8xfWDb1Voo-F9a7ZxJ",
    "refresh_token": "", // 授权 token
    /**
     * 设置要显示的多个云端硬盘；按格式添加多个
     * id 可以是 团队盘id、子文件夹id、或者"root"（代表个人盘根目录）；
     * name 显示的名称
     * pass 为对应的密码，可以单独设置，不需要密码则设置为空字符串；
     */
    "roots": [
        {
            id: "root",
            name: "个人盘",
            pass: ""
        },
        {
            id: "drive_id",
            name: "团队盘1",
            pass: "111"
        },
        {
            id: "folder_id",
            name: "文件夹",
            pass: "222"
        }
    ],
    /**
     * 文件列表页面每页显示的数量。【推荐设置值为 100 到 1000 之间】；
     * 如果设置大于1000，会导致请求 drive api 时出错；
     * 如果设置的值过小，会导致滚动条增量加载（分页加载）失效；
     * 此值的另一个作用是，如果目录内文件数大于此设置值（即需要多页展示的），将会对首次列目录结果进行缓存。
     */
    "files_list_page_size": 500
};

// gd instances
var gds = [];

function html(current_drive_order = 0) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0,maximum-scale=1.0, user-scalable=no"/>
  <title>${authConfig.siteName}</title>
  <script>
    window.drive_names = JSON.parse('${JSON.stringify(authConfig.roots.map(it => it.name))}');
    window.current_drive_order = ${current_drive_order};
  </script>
  <script src="//cdn.jsdelivr.net/combine/gh/jquery/jquery@3.2/dist/jquery.min.js,gh/yanzai/goindex@_200305/themes/${authConfig.theme}/app.js"></script>
  <script src="//cdnjs.cloudflare.com/ajax/libs/mdui/0.4.3/js/mdui.min.js"></script>
</head>
<body>
</body>
</html>
`;
};

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleRequest(request) {
    if (gds.length === 0) {
        for (let i = 0; i < authConfig.roots.length; i++) {
            gds.push(new googleDrive(authConfig, i))
        }
    }

    // 从 path 中提取 drive order
    // 并根据 drive order 获取对应的 gd instance
    let gd;
    let url = new URL(request.url);
    let path = url.pathname;

    /**
     * 重定向至起始页
     * @returns {Response}
     */
    function redirectToIndexPage() {
        return new Response('', {status: 301, headers: {'Location': `${url.origin}/0:/`}});
    }

    if (path == '/') return redirectToIndexPage();
    if (path.toLowerCase() == '/favicon.ico') {
        // 后面可以找一个 favicon
        return new Response('', {status: 404})
    }
    // 期望的 path 格式
    let reg = /^\/\d+:\/.*$/g;
    try {
        if (!path.match(reg)) {
            return redirectToIndexPage();
        }
        let split = path.split("/");
        let order = Number(split[1].slice(0, -1));
        if (order >= 0 && order < gds.length) {
            gd = gds[order];
        } else {
            return redirectToIndexPage()
        }
    } catch (e) {
        return redirectToIndexPage()
    }

    path = path.replace(gd.url_path_prefix, '') || '/';
    if (request.method == 'POST') {
        return apiRequest(request, gd);
    }

    let action = url.searchParams.get('a');

    if (path.substr(-1) == '/' || action != null) {
        return new Response(html(gd.order), {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}});
    } else {
        if (path.split('/').pop().toLowerCase() == ".password") {
            return new Response("", {status: 404});
        }
        let file = await gd.file(path);
        let range = request.headers.get('Range');
        return gd.down(file.id, range);
    }
}


async function apiRequest(request, gd) {
    let url = new URL(request.url);
    let path = url.pathname;
    path = path.replace(gd.url_path_prefix, '') || '/';

    let option = {status: 200, headers: {'Access-Control-Allow-Origin': '*'}}

    if (path.substr(-1) == '/') {
        let deferred_pass = gd.password(path);
        let form = await request.formData();
        // 这样可以提升首次列目录时的速度。缺点是，如果password验证失败，也依然会产生列目录的开销
        let deferred_list_result = gd.list(path, form.get('page_token'), Number(form.get('page_index')));

        // check password
        let password = await deferred_pass;
        console.log("dir password", password);
        if (password != undefined && password != null && password != "") {
            if (password.replace("\n", "") != form.get('password')) {
                let html = `{"error": {"code": 401,"message": "password error."}}`;
                return new Response(html, option);
            }
        }

        let list_result = await deferred_list_result;
        return new Response(JSON.stringify(list_result), option);
    } else {
        let file = await gd.file(path);
        let range = request.headers.get('Range');
        return new Response(JSON.stringify(file));
    }
}

class googleDrive {
    constructor(authConfig, order) {
        // 每个盘对应一个order，对应一个gd实例
        this.order = order;
        this.root = authConfig.roots[order];
        this.url_path_prefix = `/${order}:`;
        this.authConfig = authConfig;
        // path id
        this.paths = [];
        // path file
        this.files = [];
        // path pass
        this.passwords = [];

        this.paths["/"] = this.root['id'];
        if (this.root['pass'] != "") {
            this.passwords['/'] = this.root['pass'];
        }
        this.accessToken();
    }

    async down(id, range = '') {
        let url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
        let requestOption = await this.requestOption();
        requestOption.headers['Range'] = range;
        return await fetch(url, requestOption);
    }

    async file(path) {
        if (typeof this.files[path] == 'undefined') {
            this.files[path] = await this._file(path);
        }
        return this.files[path];
    }

    async _file(path) {
        let arr = path.split('/');
        let name = arr.pop();
        name = decodeURIComponent(name).replace(/\'/g, "\\'");
        let dir = arr.join('/') + '/';
        console.log(name, dir);
        let parent = await this.findPathId(dir);
        console.log(parent);
        let url = 'https://www.googleapis.com/drive/v3/files';
        let params = {'includeItemsFromAllDrives': true, 'supportsAllDrives': true};
        params.q = `'${parent}' in parents and name = '${name}' and trashed = false`;
        params.fields = "files(id, name, mimeType, size ,createdTime, modifiedTime, iconLink, thumbnailLink)";
        url += '?' + this.enQuery(params);
        let requestOption = await this.requestOption();
        let response = await fetch(url, requestOption);
        let obj = await response.json();
        console.log(obj);
        return obj.files[0];
    }

    // 通过reqeust cache 来缓存
    async list(path, page_token = null, page_index = 0) {
        if (this.path_children_cache == undefined) {
            // { <path> :[ {nextPageToken:'',data:{}}, {nextPageToken:'',data:{}} ...], ...}
            this.path_children_cache = {};
        }

        if (this.path_children_cache[path]
            && this.path_children_cache[path][page_index]
            && this.path_children_cache[path][page_index].data
        ) {
            let child_obj = this.path_children_cache[path][page_index];
            return {
                nextPageToken: child_obj.nextPageToken || null,
                curPageIndex: page_index,
                data: child_obj.data
            };
        }

        let id = await this.findPathId(path);
        let result = await this._ls(id, page_token, page_index);
        let data = result.data;
        // 对有多页的，进行缓存
        if (result.nextPageToken && data.files) {
            if (!Array.isArray(this.path_children_cache[path])) {
                this.path_children_cache[path] = []
            }
            this.path_children_cache[path][Number(result.curPageIndex)] = {
                nextPageToken: result.nextPageToken,
                data: data
            };
        }

        return result
    }


    async _ls(parent, page_token = null, page_index = 0) {
        console.log("_ls", parent);

        if (parent == undefined) {
            return null;
        }
        let obj;
        let params = {'includeItemsFromAllDrives': true, 'supportsAllDrives': true};
        params.q = `'${parent}' in parents and trashed = false AND name !='.password'`;
        params.orderBy = 'folder,name,modifiedTime desc';
        params.fields = "nextPageToken, files(id, name, mimeType, size , modifiedTime)";
        params.pageSize = this.authConfig.files_list_page_size;

        if (page_token) {
            params.pageToken = page_token;
        }
        let url = 'https://www.googleapis.com/drive/v3/files';
        url += '?' + this.enQuery(params);
        let requestOption = await this.requestOption();
        let response = await fetch(url, requestOption);
        obj = await response.json();

        return {
            nextPageToken: obj.nextPageToken || null,
            curPageIndex: page_index,
            data: obj
        };

        /*do {
            if (pageToken) {
                params.pageToken = pageToken;
            }
            let url = 'https://www.googleapis.com/drive/v3/files';
            url += '?' + this.enQuery(params);
            let requestOption = await this.requestOption();
            let response = await fetch(url, requestOption);
            obj = await response.json();
            files.push(...obj.files);
            pageToken = obj.nextPageToken;
        } while (pageToken);*/

    }

    async password(path) {
        if (this.passwords[path] !== undefined) {
            return this.passwords[path];
        }

        console.log("load", path, ".password", this.passwords[path]);

        let file = await this.file(path + '.password');
        if (file == undefined) {
            this.passwords[path] = null;
        } else {
            let url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
            let requestOption = await this.requestOption();
            let response = await this.fetch200(url, requestOption);
            this.passwords[path] = await response.text();
        }

        return this.passwords[path];
    }


    async findPathId(path) {
        let c_path = '/';
        let c_id = this.paths[c_path];

        let arr = path.trim('/').split('/');
        for (let name of arr) {
            c_path += name + '/';

            if (typeof this.paths[c_path] == 'undefined') {
                let id = await this._findDirId(c_id, name);
                this.paths[c_path] = id;
            }

            c_id = this.paths[c_path];
            if (c_id == undefined || c_id == null) {
                break;
            }
        }
        console.log(this.paths);
        return this.paths[path];
    }

    async _findDirId(parent, name) {
        name = decodeURIComponent(name).replace(/\'/g, "\\'");

        console.log("_findDirId", parent, name);

        if (parent == undefined) {
            return null;
        }

        let url = 'https://www.googleapis.com/drive/v3/files';
        let params = {'includeItemsFromAllDrives': true, 'supportsAllDrives': true};
        params.q = `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${name}'  and trashed = false`;
        params.fields = "nextPageToken, files(id, name, mimeType)";
        url += '?' + this.enQuery(params);
        let requestOption = await this.requestOption();
        let response = await fetch(url, requestOption);
        let obj = await response.json();
        if (obj.files[0] == undefined) {
            return null;
        }
        return obj.files[0].id;
    }

    async accessToken() {
        console.log("accessToken");
        if (this.authConfig.expires == undefined || this.authConfig.expires < Date.now()) {
            const obj = await this.fetchAccessToken();
            if (obj.access_token != undefined) {
                this.authConfig.accessToken = obj.access_token;
                this.authConfig.expires = Date.now() + 3500 * 1000;
            }
        }
        return this.authConfig.accessToken;
    }

    async fetchAccessToken() {
        console.log("fetchAccessToken");
        const url = "https://www.googleapis.com/oauth2/v4/token";
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const post_data = {
            'client_id': this.authConfig.client_id,
            'client_secret': this.authConfig.client_secret,
            'refresh_token': this.authConfig.refresh_token,
            'grant_type': 'refresh_token'
        }

        let requestOption = {
            'method': 'POST',
            'headers': headers,
            'body': this.enQuery(post_data)
        };

        const response = await fetch(url, requestOption);
        return await response.json();
    }

    async fetch200(url, requestOption) {
        let response;
        for (let i = 0; i < 3; i++) {
            response = await fetch(url, requestOption);
            console.log(response.status);
            if (response.status != 403) {
                break;
            }
            await this.sleep(800 * (i + 1));
        }
        return response;
    }

    async requestOption(headers = {}, method = 'GET') {
        const accessToken = await this.accessToken();
        headers['authorization'] = 'Bearer ' + accessToken;
        return {'method': method, 'headers': headers};
    }

    enQuery(data) {
        const ret = [];
        for (let d in data) {
            ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
        }
        return ret.join('&');
    }

    sleep(ms) {
        return new Promise(function (resolve, reject) {
            let i = 0;
            setTimeout(function () {
                console.log('sleep' + ms);
                i++;
                if (i >= 2) reject(new Error('i>=2'));
                else resolve(i);
            }, ms);
        })
    }
}

String.prototype.trim = function (char) {
    if (char) {
        return this.replace(new RegExp('^\\' + char + '+|\\' + char + '+$', 'g'), '');
    }
    return this.replace(/^\s+|\s+$/g, '');
};
