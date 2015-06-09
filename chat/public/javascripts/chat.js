var hasOwn = Object.prototype.hasOwnProperty;

var each = function (items, cb) {
    if (items instanceof Array) {
        for (var i = -1, item; item = items[++i];) {
            if (cb.call(items, item, i) === each.break) {
                break;
            }
        }
    } else {
        for (var k in items) {
            if (!hasOwn.call(items, k)) {
                continue;
            }
            if (cb.call(items, k, items[k]) === each.break) {
                break;
            }
        }
    }
};
each.break = {};

var classCreate = function (attr) {
    var klass = function () {
        if (this.initialize) {
            this.initialize.apply(this, arguments);
        }
        this._listeners = {};
    };

    klass.prototype = attr;
    klass.prototype.constructor = klass;

    klass.prototype.on = function (name, cb) {
        var me = this,
            ls = me._listeners;

        if (ls[name]) {
            ls[name].push(cb);
        }
        ls[name] = [cb];

        return me;
    };

    klass.prototype.one = function (name, cb) {
        var me = this,
            ls = me._listeners;

        cb = function () {
            cb.apply(me, arguments);
            me.off(name, cb);
        };

        if (ls[name]) {
            ls[name].push(cb);
        }
        ls[name] = [cb];

        return me;
    };

    klass.prototype.off = function (name, cb) {
        var me = this,
            ls = me._listeners;

        if (!ls[name]) {
            return me;
        }
        if (cb) {
            each(ls[name], function (item, i) {
                if (cb === item) {
                    ls[name].splice(i, 1);
                    return each.break;
                }
            });
        } else {
            ls[name] = [];
        }

        return me;
    };


    klass.prototype.trigger = function (name) {
        var me = this,
            ls = me._listeners,
            args = [].slice.call(arguments, 1);

        if (!ls[name]) {
            return me;
        }
        each(ls[name], function (item, i) {
            item.apply(me, args);
        });
        return me;
    };


    return klass;
};

var Chat = classCreate({
    initialize: function () {
        var me = this;

        me.socket = io.connect();
        Chat.from = $.cookie('user');
        Chat.to = 'all';

        me.content = new ChatContent();
        me.userList = new ChatUserList({from: Chat.from});
        me.input = new ChatInput({from: Chat.from});

        me._binds();
    },

    _binds: function () {
        var me = this,
            socket = me.socket;

        var title = function(n){
            var title = document.title.replace(/^\([0-9]+\) /, '');
            if(n > 0) {
                document.title = '(' + newCount + ') ' + title;
            } else {
                document.title = title;
            }
        };

        me.userList.on('changedUser', function (data) {
            Chat.to = data.to
            me.input.changeSayTo(Chat.from, Chat.to);
        });

        me.input.on('enterMessage', function (data) {
            if (Chat.to == "all") {
                me.content.append(Chat.from, data.msg);
            } else {
                me.content.append(Chat.from, data.msg, '#00f');
            }

            title(newCount = 0);
            socket.emit('say', {from: Chat.from, to: Chat.to, msg: data.msg});
        });

        socket.emit('online', {user: Chat.from});
        socket.on('online', function (data) {
            var sysMsg;

            if (data.user != Chat.from) {
                sysMsg = '[' + entity(data.user) + ']님이 입장하셨습니다.';
            } else {
                sysMsg = '입장되었습니다.';
            }
            me.content.notify(sysMsg);
            me.userList.flush(data.users);
        });

        var newCount = 0;
        socket.on('say', function (data) {
            if (data.to == 'all') {
                me.content.append(data.from, data.msg);
            } else if (data.to == Chat.from) {
                me.content.append(data.from, data.msg, '#00f');
            }

            if(!window.isActive) {
                title(newCount+=1);
            } else {
                title(newCount = 0);
            }
        });

        socket.on('offline', function (data) {
            me.content.notify('[' + entity(data.user) + ']님이 퇴장하셨습니다.！');
            me.userList.flush(data.users);

            if (data.user == Chat.to) {
                Chat.to = "all";
            }
            me.input.changeSayTo(Chat.from, Chat.to);

        });

        socket.on('disconnect', function () {
            me.content.notify('서버: 연결끊김！');
            me.userList.empty();
        });

        socket.on('reconnect', function () {
            me.content.notify('서버: 재접속 되었습니다！');
            socket.emit('online', {user: Chat.from});
        });

    }
});

function entity(val) {
    return (val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace('"', '&quot;');
}
function now() {
    var date = new Date();
    var zf = function(val) {
        if(val < 10) return '0'+val;
        return val;
    };
    var time = date.getFullYear() + '/' + zf(date.getMonth() + 1) + '/' + zf(date.getDate()) + ' ' + zf(date.getHours()) + ':' + zf(date.getMinutes()) + ":" + zf(date.getSeconds());
    return time;
}
var ChatContent = classCreate({
    initialize: function () {
        var me = this;
        me.$content = $("#contents");
    },

    notify: function (msg) {
        var me = this;
        me.$content.append('<div style="color:#f00;">서버 (' + now() + '): ' + entity(msg) + '</div><br/>');
        me.scrollBottom();
    },

    append: function (from, msg, color) {
        var me = this;
        me.$content.append('<div style="' + (color || '') + '">' + entity(from) + '님 (' + now() + ')：<br/>' + entity(msg) + '</div><br />');
        me.scrollBottom();
    },

    scrollBottom: function () {
        var me = this;
        me.$content.scrollTop(me.$content[0].scrollHeight);
    }
});

var ChatUserList = classCreate({
    initialize: function (opts) {
        var me = this;

        me.from = opts.from;
        me.$list = $('#list');
    },
    flush: function (users) {
        var me = this;

        me.$list.empty().append('<li title="모두에게"  data-user="all" class="sayingto" onselectstart="return false">모두에게</li>');

        for (var i in users) {
            me.$list.append('<li data-user="' + users[i] + '" title="더블클릭하시면 해당 유저에게만 메세지 보낼수 있습니다." onselectstart="return false">' + entity(users[i]) + (users[i] === from ? '(나)' : '') + '</li>');
        }

        me.$list.find("> li").dblclick(function () {
            if ($(this).attr('data-user') != me.from) {
                me.$list.find("> li").removeClass('sayingto');
                me.trigger('changedUser', {to: $(this).addClass('sayingto').attr('data-user')});
            }
        });
    },
    empty: function () {
        this.$list.empty();
    }
});

var ChatInput = classCreate({
    initialize: function (opts) {
        this._binds();
        this.changeSayTo();
    },

    _binds: function () {
        var me = this;

        $("#say").click(function () {
            var $msg = $("#input_content").val();
            if ($msg == "") return;

            me.trigger('enterMessage', {msg: $msg});
            $("#input_content").val("").focus();
        });
    },

    changeSayTo: function (from, to) {
        $("#from").html(Chat.from);
        $("#to").html(Chat.to == "all" ? "모두" : to);
    }
});

$(document).ready(function () {
    window.onbeforeunload = function () {
        return "대화내용이 초기화됩니다.\n새로고침 하시겠습니까？";
    };

    var detectActive = function (cb) {
        var hidden = "hidden";

        // Standards:
        if (hidden in document)
            document.addEventListener("visibilitychange", onchange);
        else if ((hidden = "mozHidden") in document)
            document.addEventListener("mozvisibilitychange", onchange);
        else if ((hidden = "webkitHidden") in document)
            document.addEventListener("webkitvisibilitychange", onchange);
        else if ((hidden = "msHidden") in document)
            document.addEventListener("msvisibilitychange", onchange);
        // IE 9 and lower:
        else if ("onfocusin" in document)
            document.onfocusin = document.onfocusout = onchange;
        // All others:
        else
            window.onpageshow = window.onpagehide
                = window.onfocus = window.onblur = onchange;

        function onchange(evt) {
            var v = "visible", h = "hidden",
                evtMap = {
                    focus: v, focusin: v, pageshow: v, blur: h, focusout: h, pagehide: h
                };

            evt = evt || window.event;
            if (evt.type in evtMap)
                cb(evtMap[evt.type] === 'visible');
            else
                cb(!this[hidden]);
        }

        // set the initial state (but only if browser supports the Page Visibility API)
        if (document[hidden] !== undefined)
            onchange({type: document[hidden] ? "blur" : "focus"});
    };

    window.isActive = true;
    detectActive(function(v){
        $(window).trigger('toggleactive', {active: v});
        window.isActive = v;
    });
    new Chat();

});
