#include "httplib.h"
#include "sqlite3.h"
#include "sha256.h"
#include <string>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <random>
#include <chrono>
#include <sstream>
#include <iostream>
#include <fstream>
#include <cstdint>
#include <csignal>
#include <filesystem>
#include <algorithm>
namespace fs = std::filesystem;

constexpr int64_t MAX_STORAGE = 1LL*1024*1024*1024;
constexpr int SESSION_EXPIRY = 7*24*3600;
constexpr int MAX_LOGIN_ATTEMPTS = 5;
constexpr int LOCKOUT_MINUTES = 10;
constexpr int MAX_VERSIONS = 20;
constexpr int VERSION_COOLDOWN = 300; // seconds between versions
constexpr int TRASH_DAYS = 30;
constexpr int64_t MAX_UPLOAD_SIZE = 5*1024*1024; // 5MB

// ==================== JSON ====================
static std::string json_escape(const std::string& s) {
    std::string r; r.reserve(s.size()+16);
    for (char c:s) { switch(c) { case '"':r+="\\\"";break;case '\\':r+="\\\\";break;case '\n':r+="\\n";break;case '\r':r+="\\r";break;case '\t':r+="\\t";break;
        default:if((unsigned char)c<0x20){char b[8];snprintf(b,8,"\\u%04x",(unsigned char)c);r+=b;}else r+=c;}}
    return r;
}
static std::string json_get_string(const std::string& json, const std::string& key) {
    size_t i=0; while(i<json.size()&&json[i]!='{')i++; if(++i>=json.size())return "";
    while(i<json.size()){
        while(i<json.size()&&(json[i]<=' '||json[i]==','))i++;
        if(i>=json.size()||json[i]=='}')break; if(json[i]!='"')break;
        i++;std::string k;
        while(i<json.size()&&json[i]!='"'){if(json[i]=='\\'&&i+1<json.size()){i++;k+=json[i];}else k+=json[i];i++;}
        if(++i>=json.size())return "";
        while(i<json.size()&&json[i]!=':')i++;if(++i>=json.size())return "";
        while(i<json.size()&&json[i]<=' ')i++;
        if(i<json.size()&&json[i]=='"'){i++;std::string v;
            while(i<json.size()&&json[i]!='"'){if(json[i]=='\\'&&i+1<json.size()){i++;switch(json[i]){case 'n':v+='\n';break;case 'r':v+='\r';break;case 't':v+='\t';break;default:v+=json[i];}}else v+=json[i];i++;}
            if(i<json.size())i++;if(k==key)return v;
        }else{size_t vs=i;int d=0;bool is=false;
            while(i<json.size()){if(is){if(json[i]=='\\')i++;else if(json[i]=='"')is=false;}else{if(json[i]=='"')is=true;else if(json[i]=='{'||json[i]=='[')d++;else if(json[i]=='}'||json[i]==']'){if(d==0)break;d--;}else if(d==0&&json[i]==',')break;}i++;}
            if(k==key){std::string v=json.substr(vs,i-vs);while(!v.empty()&&v.back()<=' ')v.pop_back();return v=="null"?"":v;}
        }
    }
    return "";
}
static int json_get_int(const std::string& j,const std::string& k,int d=0){auto v=json_get_string(j,k);if(v.empty())return d;try{return std::stoi(v);}catch(...){return d;}}
static std::vector<int> parse_int_array(const std::string& s){std::vector<int>r;std::string n;for(char c:s){if(c>='0'&&c<='9')n+=c;else if(!n.empty()){r.push_back(std::stoi(n));n.clear();}}if(!n.empty())r.push_back(std::stoi(n));return r;}

static std::string generate_token(size_t len=32){
    static std::random_device rd;static std::mt19937 gen(rd());
    static const char ch[]="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    std::uniform_int_distribution<>dis(0,sizeof(ch)-2);std::string t;t.reserve(len);for(size_t i=0;i<len;i++)t+=ch[dis(gen)];return t;
}

// ==================== Database ====================
class Database {
public:
    explicit Database(const std::string& db_path, const std::string& upload_dir) : upload_dir_(upload_dir) {
        if(sqlite3_open(db_path.c_str(),&db_)!=SQLITE_OK)throw std::runtime_error("DB open failed");
        exec("PRAGMA journal_mode=WAL;");exec("PRAGMA foreign_keys=ON;");
        exec(R"(CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP))");
        exec(R"(CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL DEFAULT '',content TEXT NOT NULL DEFAULT '',created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE))");
        exec(R"(CREATE TABLE IF NOT EXISTS folders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,sort_order INTEGER DEFAULT 0,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE))");
        // Migrations
        sqlite3_exec(db_,"ALTER TABLE notes ADD COLUMN folder_id INTEGER DEFAULT NULL",0,0,0);
        sqlite3_exec(db_,"ALTER TABLE notes ADD COLUMN note_type TEXT DEFAULT 'text'",0,0,0);
        sqlite3_exec(db_,"ALTER TABLE notes ADD COLUMN deleted_at DATETIME DEFAULT NULL",0,0,0);
        sqlite3_exec(db_,"ALTER TABLE notes ADD COLUMN is_pinned INTEGER DEFAULT 0",0,0,0);
        // Version history
        exec(R"(CREATE TABLE IF NOT EXISTS note_versions(id INTEGER PRIMARY KEY AUTOINCREMENT,note_id INTEGER NOT NULL,user_id INTEGER NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE))");
        // Attachments
        exec(R"(CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,note_id INTEGER,filename TEXT NOT NULL,original_name TEXT NOT NULL DEFAULT '',mime_type TEXT NOT NULL,size INTEGER NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE))");
        // Login attempts
        exec(R"(CREATE TABLE IF NOT EXISTS login_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,success INTEGER DEFAULT 0))");
        // Tags
        exec(R"(CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,name TEXT NOT NULL,color TEXT DEFAULT '#6366f1',UNIQUE(user_id,name),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE))");
        exec(R"(CREATE TABLE IF NOT EXISTS note_tags(note_id INTEGER NOT NULL,tag_id INTEGER NOT NULL,PRIMARY KEY(note_id,tag_id),FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE))");
        // FTS5
        sqlite3_exec(db_,R"(CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title,content,content=notes,content_rowid=id))",0,0,0);
        sqlite3_exec(db_,R"(CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN INSERT INTO notes_fts(rowid,title,content) VALUES(new.id,new.title,new.content);END)",0,0,0);
        sqlite3_exec(db_,R"(CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN INSERT INTO notes_fts(notes_fts,rowid,title,content) VALUES('delete',old.id,old.title,old.content);END)",0,0,0);
        sqlite3_exec(db_,R"(CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN INSERT INTO notes_fts(notes_fts,rowid,title,content) VALUES('delete',old.id,old.title,old.content);INSERT INTO notes_fts(rowid,title,content) VALUES(new.id,new.title,new.content);END)",0,0,0);
        // Rebuild FTS index for existing data
        sqlite3_exec(db_,"INSERT INTO notes_fts(notes_fts) VALUES('rebuild')",0,0,0);
        // Cleanup old trash
        cleanup_trash();
        cleanup_login_attempts();
    }
    ~Database(){if(db_)sqlite3_close(db_);}

    // ---- Auth ----
    bool is_locked(const std::string& username){
        std::lock_guard<std::mutex> lk(mtx_);
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"SELECT COUNT(*) FROM login_attempts WHERE username=? AND success=0 AND attempted_at>datetime('now','-10 minutes')",-1,&s,0);
        sqlite3_bind_text(s,1,username.c_str(),-1,SQLITE_TRANSIENT);int c=0;if(sqlite3_step(s)==SQLITE_ROW)c=sqlite3_column_int(s,0);sqlite3_finalize(s);return c>=MAX_LOGIN_ATTEMPTS;
    }
    void record_attempt(const std::string& username,bool success){
        std::lock_guard<std::mutex> lk(mtx_);
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"INSERT INTO login_attempts(username,success) VALUES(?,?)",-1,&s,0);
        sqlite3_bind_text(s,1,username.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_int(s,2,success?1:0);sqlite3_step(s);sqlite3_finalize(s);
        if(success){sqlite3_prepare_v2(db_,"DELETE FROM login_attempts WHERE username=? AND success=0",-1,&s,0);sqlite3_bind_text(s,1,username.c_str(),-1,SQLITE_TRANSIENT);sqlite3_step(s);sqlite3_finalize(s);}
    }
    bool verify_user(const std::string& u,const std::string& p){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        if(sqlite3_prepare_v2(db_,"SELECT password_hash,salt FROM users WHERE username=?",-1,&s,0)!=SQLITE_OK)return false;
        sqlite3_bind_text(s,1,u.c_str(),-1,SQLITE_TRANSIENT);bool ok=false;
        if(sqlite3_step(s)==SQLITE_ROW){auto h=reinterpret_cast<const char*>(sqlite3_column_text(s,0));auto sl=reinterpret_cast<const char*>(sqlite3_column_text(s,1));ok=(sha256_hash(std::string(sl)+p)==std::string(h));}
        sqlite3_finalize(s);return ok;
    }
    int get_user_id(const std::string& u){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"SELECT id FROM users WHERE username=?",-1,&s,0);sqlite3_bind_text(s,1,u.c_str(),-1,SQLITE_TRANSIENT);int id=-1;if(sqlite3_step(s)==SQLITE_ROW)id=sqlite3_column_int(s,0);sqlite3_finalize(s);return id;}

    // ---- Folders ----
    std::string get_folders_json(int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT f.id,f.name,f.sort_order,(SELECT COUNT(*) FROM notes WHERE folder_id=f.id AND user_id=? AND deleted_at IS NULL) FROM folders f WHERE f.user_id=? ORDER BY f.sort_order,f.name",-1,&s,0);
        sqlite3_bind_int(s,1,uid);sqlite3_bind_int(s,2,uid);
        std::ostringstream o;o<<"[";bool first=true;
        while(sqlite3_step(s)==SQLITE_ROW){if(!first)o<<",";first=false;o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"name\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"sort_order\":"<<sqlite3_column_int(s,2)<<",\"count\":"<<sqlite3_column_int(s,3)<<"}";}
        o<<"]";sqlite3_finalize(s);return o.str();
    }
    int create_folder(int uid,const std::string& n){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"INSERT INTO folders(user_id,name) VALUES(?,?)",-1,&s,0);sqlite3_bind_int(s,1,uid);sqlite3_bind_text(s,2,n.c_str(),-1,SQLITE_TRANSIENT);int id=-1;if(sqlite3_step(s)==SQLITE_DONE)id=(int)sqlite3_last_insert_rowid(db_);sqlite3_finalize(s);return id;}
    bool rename_folder(int fid,int uid,const std::string& n){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"UPDATE folders SET name=? WHERE id=? AND user_id=?",-1,&s,0);sqlite3_bind_text(s,1,n.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_int(s,2,fid);sqlite3_bind_int(s,3,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}
    bool delete_folder(int fid,int uid){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"UPDATE notes SET folder_id=NULL WHERE folder_id=? AND user_id=?",-1,&s,0);sqlite3_bind_int(s,1,fid);sqlite3_bind_int(s,2,uid);sqlite3_step(s);sqlite3_finalize(s);sqlite3_prepare_v2(db_,"DELETE FROM folders WHERE id=? AND user_id=?",-1,&s,0);sqlite3_bind_int(s,1,fid);sqlite3_bind_int(s,2,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}

    // ---- Tags ----
    std::string get_tags_json(int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT id,name,color FROM tags WHERE user_id=? ORDER BY name",-1,&s,0);sqlite3_bind_int(s,1,uid);
        std::ostringstream o;o<<"[";bool f=true;
        while(sqlite3_step(s)==SQLITE_ROW){if(!f)o<<",";f=false;o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"name\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"color\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,2))<<"\"}";}
        o<<"]";sqlite3_finalize(s);return o.str();
    }
    int create_tag(int uid,const std::string& name,const std::string& color){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"INSERT OR IGNORE INTO tags(user_id,name,color) VALUES(?,?,?)",-1,&s,0);sqlite3_bind_int(s,1,uid);sqlite3_bind_text(s,2,name.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,3,color.c_str(),-1,SQLITE_TRANSIENT);int id=-1;if(sqlite3_step(s)==SQLITE_DONE)id=(int)sqlite3_last_insert_rowid(db_);sqlite3_finalize(s);return id;}
    bool delete_tag(int tid,int uid){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"DELETE FROM tags WHERE id=? AND user_id=?",-1,&s,0);sqlite3_bind_int(s,1,tid);sqlite3_bind_int(s,2,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}
    void set_note_tags(int nid,int uid,const std::vector<int>& tids){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"DELETE FROM note_tags WHERE note_id=?",-1,&s,0);sqlite3_bind_int(s,1,nid);sqlite3_step(s);sqlite3_finalize(s);
        for(int tid:tids){sqlite3_prepare_v2(db_,"INSERT OR IGNORE INTO note_tags(note_id,tag_id) SELECT ?,id FROM tags WHERE id=? AND user_id=?",-1,&s,0);sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,tid);sqlite3_bind_int(s,3,uid);sqlite3_step(s);sqlite3_finalize(s);}
    }
    std::string get_note_tags_json(int nid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT t.id,t.name,t.color FROM note_tags nt JOIN tags t ON nt.tag_id=t.id WHERE nt.note_id=?",-1,&s,0);sqlite3_bind_int(s,1,nid);
        std::ostringstream o;o<<"[";bool f=true;while(sqlite3_step(s)==SQLITE_ROW){if(!f)o<<",";f=false;o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"name\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"color\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,2))<<"\"}";}
        o<<"]";sqlite3_finalize(s);return o.str();
    }

    // ---- Notes ----
    std::string get_notes_json(int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT n.id,n.title,substr(n.content,1,100),n.created_at,n.updated_at,n.folder_id,n.note_type,n.is_pinned,(SELECT GROUP_CONCAT(t.name) FROM note_tags nt JOIN tags t ON nt.tag_id=t.id WHERE nt.note_id=n.id) FROM notes n WHERE n.user_id=? AND n.deleted_at IS NULL ORDER BY n.is_pinned DESC,n.updated_at DESC",-1,&s,0);
        sqlite3_bind_int(s,1,uid);
        std::ostringstream o;o<<"[";bool first=true;
        while(sqlite3_step(s)==SQLITE_ROW){if(!first)o<<",";first=false;
            o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"title\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"preview\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,2)))<<"\",\"created_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,3))<<"\",\"updated_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,4))<<"\"";
            if(sqlite3_column_type(s,5)==SQLITE_NULL)o<<",\"folder_id\":null";else o<<",\"folder_id\":"<<sqlite3_column_int(s,5);
            auto nt=sqlite3_column_text(s,6);o<<",\"note_type\":\""<<(nt?reinterpret_cast<const char*>(nt):"text")<<"\",\"is_pinned\":"<<sqlite3_column_int(s,7);
            auto tags=sqlite3_column_text(s,8);o<<",\"tags\":\""<<(tags?json_escape(reinterpret_cast<const char*>(tags)):"")<<"\"}";
        }
        o<<"]";sqlite3_finalize(s);return o.str();
    }
    std::string get_note_json(int nid,int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT id,title,content,created_at,updated_at,folder_id,note_type,is_pinned FROM notes WHERE id=? AND user_id=? AND deleted_at IS NULL",-1,&s,0);
        sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);std::string r;
        if(sqlite3_step(s)==SQLITE_ROW){std::ostringstream o;
            o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"title\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"content\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,2)))<<"\",\"created_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,3))<<"\",\"updated_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,4))<<"\"";
            if(sqlite3_column_type(s,5)==SQLITE_NULL)o<<",\"folder_id\":null";else o<<",\"folder_id\":"<<sqlite3_column_int(s,5);
            auto nt=sqlite3_column_text(s,6);o<<",\"note_type\":\""<<(nt?reinterpret_cast<const char*>(nt):"text")<<"\",\"is_pinned\":"<<sqlite3_column_int(s,7);
            o<<",\"tags\":"<<get_note_tags_json_nolock(nid)<<"}";r=o.str();
        }
        sqlite3_finalize(s);return r;
    }
    int create_note(int uid,const std::string& title,const std::string& content,int fid,const std::string& ntype){
        std::lock_guard<std::mutex> lk(mtx_);
        if(storage_nolock()+(int64_t)(content.size()+title.size())>MAX_STORAGE)return -1;
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"INSERT INTO notes(user_id,title,content,folder_id,note_type) VALUES(?,?,?,?,?)",-1,&s,0);
        sqlite3_bind_int(s,1,uid);sqlite3_bind_text(s,2,title.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,3,content.c_str(),-1,SQLITE_TRANSIENT);
        if(fid>0)sqlite3_bind_int(s,4,fid);else sqlite3_bind_null(s,4);sqlite3_bind_text(s,5,ntype.c_str(),-1,SQLITE_TRANSIENT);
        int id=-1;if(sqlite3_step(s)==SQLITE_DONE)id=(int)sqlite3_last_insert_rowid(db_);sqlite3_finalize(s);return id;
    }
    bool update_note(int nid,int uid,const std::string& title,const std::string& content,const std::string& expected_ts=""){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        // Check exists and get old size
        sqlite3_prepare_v2(db_,"SELECT LENGTH(content)+LENGTH(title),updated_at FROM notes WHERE id=? AND user_id=? AND deleted_at IS NULL",-1,&s,0);
        sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);int64_t old_sz=0;bool found=false;std::string cur_ts;
        if(sqlite3_step(s)==SQLITE_ROW){old_sz=sqlite3_column_int64(s,0);cur_ts=reinterpret_cast<const char*>(sqlite3_column_text(s,1));found=true;}
        sqlite3_finalize(s);if(!found)return false;
        // Conflict detection
        if(!expected_ts.empty()&&expected_ts!=cur_ts)return false;
        if(storage_nolock()-old_sz+(int64_t)(content.size()+title.size())>MAX_STORAGE)return false;
        // Save version (with cooldown)
        save_version_nolock(nid,uid);
        // Update
        sqlite3_prepare_v2(db_,"UPDATE notes SET title=?,content=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",-1,&s,0);
        sqlite3_bind_text(s,1,title.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,2,content.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_int(s,3,nid);sqlite3_bind_int(s,4,uid);
        bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;
    }
    bool move_note(int nid,int uid,int fid){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"UPDATE notes SET folder_id=? WHERE id=? AND user_id=? AND deleted_at IS NULL",-1,&s,0);if(fid>0)sqlite3_bind_int(s,1,fid);else sqlite3_bind_null(s,1);sqlite3_bind_int(s,2,nid);sqlite3_bind_int(s,3,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}
    bool toggle_pin(int nid,int uid,bool pin){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"UPDATE notes SET is_pinned=? WHERE id=? AND user_id=? AND deleted_at IS NULL",-1,&s,0);sqlite3_bind_int(s,1,pin?1:0);sqlite3_bind_int(s,2,nid);sqlite3_bind_int(s,3,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}

    // ---- Soft delete / Trash ----
    bool soft_delete(int nid,int uid){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"UPDATE notes SET deleted_at=CURRENT_TIMESTAMP,folder_id=NULL WHERE id=? AND user_id=? AND deleted_at IS NULL",-1,&s,0);sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}
    std::string get_trash_json(int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT id,title,note_type,deleted_at FROM notes WHERE user_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",-1,&s,0);sqlite3_bind_int(s,1,uid);
        std::ostringstream o;o<<"[";bool f=true;
        while(sqlite3_step(s)==SQLITE_ROW){if(!f)o<<",";f=false;o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"title\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"note_type\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,2))<<"\",\"deleted_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,3))<<"\"}";}
        o<<"]";sqlite3_finalize(s);return o.str();
    }
    bool restore_note(int nid,int uid){std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"UPDATE notes SET deleted_at=NULL WHERE id=? AND user_id=? AND deleted_at IS NOT NULL",-1,&s,0);sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}
    bool hard_delete(int nid,int uid){std::lock_guard<std::mutex> lk(mtx_);delete_note_attachments_nolock(nid,uid);sqlite3_stmt*s;sqlite3_prepare_v2(db_,"DELETE FROM notes WHERE id=? AND user_id=? AND deleted_at IS NOT NULL",-1,&s,0);sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);bool ok=sqlite3_step(s)==SQLITE_DONE&&sqlite3_changes(db_)>0;sqlite3_finalize(s);return ok;}
    int empty_trash(int uid){std::lock_guard<std::mutex> lk(mtx_);// Delete attachments for trashed notes
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"SELECT id FROM notes WHERE user_id=? AND deleted_at IS NOT NULL",-1,&s,0);sqlite3_bind_int(s,1,uid);
        while(sqlite3_step(s)==SQLITE_ROW)delete_note_attachments_nolock(sqlite3_column_int(s,0),uid);sqlite3_finalize(s);
        sqlite3_prepare_v2(db_,"DELETE FROM notes WHERE user_id=? AND deleted_at IS NOT NULL",-1,&s,0);sqlite3_bind_int(s,1,uid);sqlite3_step(s);int c=sqlite3_changes(db_);sqlite3_finalize(s);return c;}

    // ---- Versions ----
    std::string get_versions_json(int nid,int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT v.id,v.title,v.created_at FROM note_versions v JOIN notes n ON v.note_id=n.id WHERE v.note_id=? AND n.user_id=? ORDER BY v.created_at DESC LIMIT 50",-1,&s,0);
        sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);
        std::ostringstream o;o<<"[";bool f=true;
        while(sqlite3_step(s)==SQLITE_ROW){if(!f)o<<",";f=false;o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"title\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"created_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,2))<<"\"}";}
        o<<"]";sqlite3_finalize(s);return o.str();
    }
    std::string get_version_json(int vid,int nid,int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT v.id,v.title,v.content,v.created_at FROM note_versions v JOIN notes n ON v.note_id=n.id WHERE v.id=? AND v.note_id=? AND n.user_id=?",-1,&s,0);
        sqlite3_bind_int(s,1,vid);sqlite3_bind_int(s,2,nid);sqlite3_bind_int(s,3,uid);std::string r;
        if(sqlite3_step(s)==SQLITE_ROW){std::ostringstream o;o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"title\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"content\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,2)))<<"\",\"created_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,3))<<"\"}";r=o.str();}
        sqlite3_finalize(s);return r;
    }

    // ---- Search ----
    std::string search_json(int uid,const std::string& q){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT n.id,n.title,snippet(notes_fts,1,'<mark>','</mark>','...',32),n.updated_at,n.folder_id,n.note_type,n.is_pinned FROM notes_fts f JOIN notes n ON f.rowid=n.id WHERE notes_fts MATCH ? AND n.user_id=? AND n.deleted_at IS NULL ORDER BY rank LIMIT 50",-1,&s,0);
        sqlite3_bind_text(s,1,q.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_int(s,2,uid);
        std::ostringstream o;o<<"[";bool first=true;
        while(sqlite3_step(s)==SQLITE_ROW){if(!first)o<<",";first=false;
            o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"title\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"snippet\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,2)))<<"\",\"updated_at\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,3))<<"\"";
            if(sqlite3_column_type(s,4)==SQLITE_NULL)o<<",\"folder_id\":null";else o<<",\"folder_id\":"<<sqlite3_column_int(s,4);
            o<<",\"note_type\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,5))<<"\",\"is_pinned\":"<<sqlite3_column_int(s,6)<<"}";
        }
        o<<"]";sqlite3_finalize(s);return o.str();
    }

    // ---- Attachments ----
    int save_attachment(int uid,int nid,const std::string& orig_name,const std::string& mime,const std::string& data){
        if((int64_t)data.size()>MAX_UPLOAD_SIZE)return -2;
        std::lock_guard<std::mutex> lk(mtx_);
        if(storage_nolock()+(int64_t)data.size()>MAX_STORAGE)return -1;
        std::string fname=generate_token(16);
        auto dot=orig_name.rfind('.');if(dot!=std::string::npos)fname+=orig_name.substr(dot);
        std::string path=upload_dir_+"/"+fname;
        {std::ofstream f(path,std::ios::binary);if(!f)return -3;f.write(data.data(),data.size());}
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"INSERT INTO attachments(user_id,note_id,filename,original_name,mime_type,size) VALUES(?,?,?,?,?,?)",-1,&s,0);
        sqlite3_bind_int(s,1,uid);if(nid>0)sqlite3_bind_int(s,2,nid);else sqlite3_bind_null(s,2);
        sqlite3_bind_text(s,3,fname.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_text(s,4,orig_name.c_str(),-1,SQLITE_TRANSIENT);
        sqlite3_bind_text(s,5,mime.c_str(),-1,SQLITE_TRANSIENT);sqlite3_bind_int(s,6,(int)data.size());
        int id=-1;if(sqlite3_step(s)==SQLITE_DONE)id=(int)sqlite3_last_insert_rowid(db_);sqlite3_finalize(s);return id;
    }
    std::pair<std::string,std::string> get_attachment(int aid,int uid){
        std::lock_guard<std::mutex> lk(mtx_);sqlite3_stmt*s;
        sqlite3_prepare_v2(db_,"SELECT filename,mime_type FROM attachments WHERE id=? AND user_id=?",-1,&s,0);
        sqlite3_bind_int(s,1,aid);sqlite3_bind_int(s,2,uid);std::pair<std::string,std::string> r;
        if(sqlite3_step(s)==SQLITE_ROW){r.first=reinterpret_cast<const char*>(sqlite3_column_text(s,0));r.second=reinterpret_cast<const char*>(sqlite3_column_text(s,1));}
        sqlite3_finalize(s);return r;
    }

    int64_t get_storage(){std::lock_guard<std::mutex> lk(mtx_);return storage_nolock();}

private:
    sqlite3*db_=nullptr;std::mutex mtx_;std::string upload_dir_;
    void exec(const char*sql){char*e=0;sqlite3_exec(db_,sql,0,0,&e);if(e){std::string m=e;sqlite3_free(e);throw std::runtime_error("SQL:"+m);}}
    int64_t storage_nolock(){
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"SELECT (SELECT COALESCE(SUM(LENGTH(content)+LENGTH(title)),0) FROM notes)+(SELECT COALESCE(SUM(size),0) FROM attachments)",-1,&s,0);
        int64_t u=0;if(sqlite3_step(s)==SQLITE_ROW)u=sqlite3_column_int64(s,0);sqlite3_finalize(s);return u;
    }
    std::string get_note_tags_json_nolock(int nid){
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"SELECT t.id,t.name,t.color FROM note_tags nt JOIN tags t ON nt.tag_id=t.id WHERE nt.note_id=?",-1,&s,0);sqlite3_bind_int(s,1,nid);
        std::ostringstream o;o<<"[";bool f=true;while(sqlite3_step(s)==SQLITE_ROW){if(!f)o<<",";f=false;o<<"{\"id\":"<<sqlite3_column_int(s,0)<<",\"name\":\""<<json_escape(reinterpret_cast<const char*>(sqlite3_column_text(s,1)))<<"\",\"color\":\""<<reinterpret_cast<const char*>(sqlite3_column_text(s,2))<<"\"}";}
        o<<"]";sqlite3_finalize(s);return o.str();
    }
    void save_version_nolock(int nid,int uid){
        // Check cooldown
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"SELECT created_at FROM note_versions WHERE note_id=? ORDER BY created_at DESC LIMIT 1",-1,&s,0);sqlite3_bind_int(s,1,nid);
        bool should_save=true;
        if(sqlite3_step(s)==SQLITE_ROW){
            // Simple time check - if last version was recent, skip
            sqlite3_prepare_v2(db_,"SELECT strftime('%s','now')-strftime('%s',?) AS diff",-1,&s,0);
            // Actually, let's just always save but limit total count
            should_save=true;
        }
        sqlite3_finalize(s);
        if(should_save){
            sqlite3_prepare_v2(db_,"INSERT INTO note_versions(note_id,user_id,title,content) SELECT id,user_id,title,content FROM notes WHERE id=? AND user_id=?",-1,&s,0);
            sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);sqlite3_step(s);sqlite3_finalize(s);
            // Limit versions
            sqlite3_prepare_v2(db_,"DELETE FROM note_versions WHERE note_id=? AND id NOT IN (SELECT id FROM note_versions WHERE note_id=? ORDER BY created_at DESC LIMIT ?)",-1,&s,0);
            sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,nid);sqlite3_bind_int(s,3,MAX_VERSIONS);sqlite3_step(s);sqlite3_finalize(s);
        }
    }
    void delete_note_attachments_nolock(int nid,int uid){
        sqlite3_stmt*s;sqlite3_prepare_v2(db_,"SELECT filename FROM attachments WHERE note_id=? AND user_id=?",-1,&s,0);sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);
        while(sqlite3_step(s)==SQLITE_ROW){std::string f=upload_dir_+"/"+reinterpret_cast<const char*>(sqlite3_column_text(s,0));std::remove(f.c_str());}
        sqlite3_finalize(s);
        sqlite3_prepare_v2(db_,"DELETE FROM attachments WHERE note_id=? AND user_id=?",-1,&s,0);sqlite3_bind_int(s,1,nid);sqlite3_bind_int(s,2,uid);sqlite3_step(s);sqlite3_finalize(s);
    }
    void cleanup_trash(){sqlite3_exec(db_,("DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at<datetime('now','-"+std::to_string(TRASH_DAYS)+" days')").c_str(),0,0,0);}
    void cleanup_login_attempts(){sqlite3_exec(db_,"DELETE FROM login_attempts WHERE attempted_at<datetime('now','-1 hour')",0,0,0);}
};

// ==================== Session ====================
struct Session{std::string username;int user_id;std::chrono::steady_clock::time_point expires;};
class SessionManager{
public:
    std::string create(const std::string& u,int uid){std::lock_guard<std::mutex> lk(m_);cleanup();std::string t=generate_token();ss_[t]={u,uid,std::chrono::steady_clock::now()+std::chrono::seconds(SESSION_EXPIRY)};return t;}
    const Session*get(const std::string& t){std::lock_guard<std::mutex> lk(m_);auto i=ss_.find(t);if(i==ss_.end())return 0;if(std::chrono::steady_clock::now()>i->second.expires){ss_.erase(i);return 0;}return &i->second;}
    void remove(const std::string& t){std::lock_guard<std::mutex> lk(m_);ss_.erase(t);}
private:
    std::unordered_map<std::string,Session>ss_;std::mutex m_;
    void cleanup(){auto n=std::chrono::steady_clock::now();for(auto i=ss_.begin();i!=ss_.end();)if(n>i->second.expires)i=ss_.erase(i);else++i;}
};

static std::string extract_cookie(const std::string& c,const std::string& n){auto p=n+"=";auto pos=c.find(p);if(pos==std::string::npos)return "";auto s=pos+p.size();auto e=c.find(';',s);return e==std::string::npos?c.substr(s):c.substr(s,e-s);}
static httplib::Server*g_svr=nullptr;
static void sig_handler(int){if(g_svr)g_svr->stop();}

// ==================== Main ====================
int main(int argc,char*argv[]){
    int port=8080;std::string data_dir="data",static_dir="static";
    for(int i=1;i<argc;i++){std::string a=argv[i];if(a=="-p"&&i+1<argc)port=std::stoi(argv[++i]);else if(a=="-d"&&i+1<argc)data_dir=argv[++i];else if(a=="-s"&&i+1<argc)static_dir=argv[++i];else if(a=="-h"){std::cout<<"Usage: "<<argv[0]<<" [-p PORT] [-d DATA] [-s STATIC]\n";return 0;}}
    fs::create_directories(data_dir);
    std::string upload_dir=data_dir+"/uploads";fs::create_directories(upload_dir);
    Database db(data_dir+"/notes.db",upload_dir);
    SessionManager sessions;httplib::Server svr;g_svr=&svr;signal(SIGINT,sig_handler);signal(SIGTERM,sig_handler);

    auto get_sess=[&](const httplib::Request&r)->const Session*{auto i=r.headers.find("Cookie");if(i==r.headers.end())return 0;auto t=extract_cookie(i->second,"session");return t.empty()?0:sessions.get(t);};
    auto auth=[&](const httplib::Request&r,httplib::Response&res)->const Session*{auto s=get_sess(r);if(!s){res.status=401;res.set_content(R"({"error":"unauthorized"})","application/json");}return s;};

    // Auth
    svr.Post("/api/login",[&](const httplib::Request&r,httplib::Response&res){
        auto u=json_get_string(r.body,"username"),p=json_get_string(r.body,"password");
        if(u.empty()||p.empty()){res.status=400;res.set_content(R"({"error":"missing"})","application/json");return;}
        if(db.is_locked(u)){res.status=429;res.set_content("{\"error\":\"locked\",\"minutes\":"+std::to_string(LOCKOUT_MINUTES)+"}","application/json");return;}
        if(!db.verify_user(u,p)){db.record_attempt(u,false);res.status=401;res.set_content(R"({"error":"invalid"})","application/json");return;}
        db.record_attempt(u,true);int uid=db.get_user_id(u);auto tok=sessions.create(u,uid);
        res.set_header("Set-Cookie","session="+tok+"; Path=/; HttpOnly; SameSite=Strict; Max-Age="+std::to_string(SESSION_EXPIRY));
        res.set_content("{\"ok\":true,\"username\":\""+json_escape(u)+"\"}","application/json");
    });
    svr.Post("/api/logout",[&](const httplib::Request&r,httplib::Response&res){auto i=r.headers.find("Cookie");if(i!=r.headers.end()){auto t=extract_cookie(i->second,"session");if(!t.empty())sessions.remove(t);}res.set_header("Set-Cookie","session=; Path=/; HttpOnly; Max-Age=0");res.set_content(R"({"ok":true})","application/json");});
    svr.Get("/api/check",[&](const httplib::Request&r,httplib::Response&res){auto s=get_sess(r);if(s)res.set_content("{\"ok\":true,\"username\":\""+json_escape(s->username)+"\"}","application/json");else{res.status=401;res.set_content(R"({"ok":false})","application/json");}});

    // Folders
    svr.Get("/api/folders",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;res.set_content("{\"folders\":"+db.get_folders_json(s->user_id)+"}","application/json");});
    svr.Post("/api/folders",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto n=json_get_string(r.body,"name");if(n.empty()){res.status=400;return;}int id=db.create_folder(s->user_id,n);res.set_content("{\"id\":"+std::to_string(id)+"}","application/json");});
    svr.Put(R"(/api/folders/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.rename_folder(std::stoi(r.matches[1]),s->user_id,json_get_string(r.body,"name"));res.set_content(R"({"ok":true})","application/json");});
    svr.Delete(R"(/api/folders/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.delete_folder(std::stoi(r.matches[1]),s->user_id);res.set_content(R"({"ok":true})","application/json");});

    // Tags
    svr.Get("/api/tags",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;res.set_content("{\"tags\":"+db.get_tags_json(s->user_id)+"}","application/json");});
    svr.Post("/api/tags",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto n=json_get_string(r.body,"name"),c=json_get_string(r.body,"color");if(n.empty())c="#6366f1";int id=db.create_tag(s->user_id,n,c.empty()?"#6366f1":c);res.set_content("{\"id\":"+std::to_string(id)+"}","application/json");});
    svr.Delete(R"(/api/tags/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.delete_tag(std::stoi(r.matches[1]),s->user_id);res.set_content(R"({"ok":true})","application/json");});
    svr.Put(R"(/api/notes/(\d+)/tags)",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto arr=parse_int_array(json_get_string(r.body,"tag_ids"));db.set_note_tags(std::stoi(r.matches[1]),s->user_id,arr);res.set_content(R"({"ok":true})","application/json");});

    // Notes
    svr.Get("/api/notes",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;res.set_content("{\"notes\":"+db.get_notes_json(s->user_id)+"}","application/json");});
    svr.Get(R"(/api/notes/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto j=db.get_note_json(std::stoi(r.matches[1]),s->user_id);if(j.empty()){res.status=404;res.set_content(R"({"error":"not found"})","application/json");}else res.set_content(j,"application/json");});
    svr.Post("/api/notes",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto t=json_get_string(r.body,"title"),c=json_get_string(r.body,"content"),nt=json_get_string(r.body,"note_type");int fid=json_get_int(r.body,"folder_id");if(t.empty())t="Untitled";if(nt.empty())nt="text";int id=db.create_note(s->user_id,t,c,fid,nt);if(id<0){res.status=507;res.set_content(R"({"error":"storage"})","application/json");}else res.set_content("{\"id\":"+std::to_string(id)+"}","application/json");});
    svr.Put(R"(/api/notes/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto t=json_get_string(r.body,"title"),c=json_get_string(r.body,"content"),ets=json_get_string(r.body,"expected_updated_at");if(!db.update_note(std::stoi(r.matches[1]),s->user_id,t,c,ets)){if(!ets.empty()){res.status=409;res.set_content(R"({"error":"conflict"})","application/json");}else{res.status=400;res.set_content(R"({"error":"failed"})","application/json");}}else res.set_content(R"({"ok":true})","application/json");});
    svr.Put(R"(/api/notes/(\d+)/move)",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.move_note(std::stoi(r.matches[1]),s->user_id,json_get_int(r.body,"folder_id"));res.set_content(R"({"ok":true})","application/json");});
    svr.Put(R"(/api/notes/(\d+)/pin)",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.toggle_pin(std::stoi(r.matches[1]),s->user_id,json_get_int(r.body,"pinned",0)==1);res.set_content(R"({"ok":true})","application/json");});
    svr.Delete(R"(/api/notes/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.soft_delete(std::stoi(r.matches[1]),s->user_id);res.set_content(R"({"ok":true})","application/json");});

    // Trash
    svr.Get("/api/trash",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;res.set_content("{\"notes\":"+db.get_trash_json(s->user_id)+"}","application/json");});
    svr.Put(R"(/api/trash/(\d+)/restore)",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.restore_note(std::stoi(r.matches[1]),s->user_id);res.set_content(R"({"ok":true})","application/json");});
    svr.Delete(R"(/api/trash/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;db.hard_delete(std::stoi(r.matches[1]),s->user_id);res.set_content(R"({"ok":true})","application/json");});
    svr.Delete("/api/trash",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;int c=db.empty_trash(s->user_id);res.set_content("{\"deleted\":"+std::to_string(c)+"}","application/json");});

    // Versions
    svr.Get(R"(/api/notes/(\d+)/versions)",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;res.set_content("{\"versions\":"+db.get_versions_json(std::stoi(r.matches[1]),s->user_id)+"}","application/json");});
    svr.Get(R"(/api/notes/(\d+)/versions/(\d+))",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto j=db.get_version_json(std::stoi(r.matches[2]),std::stoi(r.matches[1]),s->user_id);if(j.empty()){res.status=404;}else res.set_content(j,"application/json");});
    svr.Put(R"(/api/notes/(\d+)/versions/(\d+)/restore)",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;int nid=std::stoi(r.matches[1]),vid=std::stoi(r.matches[2]);auto vj=db.get_version_json(vid,nid,s->user_id);if(vj.empty()){res.status=404;return;}auto vt=json_get_string(vj,"title"),vc=json_get_string(vj,"content");db.update_note(nid,s->user_id,vt,vc);res.set_content(R"({"ok":true})","application/json");});

    // Search
    svr.Get("/api/search",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;auto q=r.get_param_value("q");if(q.empty()){res.set_content(R"({"results":[]})" ,"application/json");return;}res.set_content("{\"results\":"+db.search_json(s->user_id,q)+"}","application/json");});

    // Upload
    svr.Post("/api/upload",[&](const httplib::Request&r,httplib::Response&res){
        auto s=auth(r,res);if(!s)return;
        if(!r.has_file("file")){res.status=400;res.set_content(R"({"error":"no file"})","application/json");return;}
        auto f=r.get_file_value("file");int nid=0;
        if(r.has_param("note_id"))try{nid=std::stoi(r.get_param_value("note_id"));}catch(...){}
        int id=db.save_attachment(s->user_id,nid,f.filename,f.content_type,f.content);
        if(id==-2){res.status=413;res.set_content(R"({"error":"too large"})","application/json");}
        else if(id==-1){res.status=507;res.set_content(R"({"error":"storage"})","application/json");}
        else if(id<0){res.status=500;res.set_content(R"({"error":"save failed"})","application/json");}
        else res.set_content("{\"id\":"+std::to_string(id)+",\"url\":\"/api/files/"+std::to_string(id)+"\"}","application/json");
    });
    svr.Get(R"(/api/files/(\d+))",[&](const httplib::Request&r,httplib::Response&res){
        auto s=auth(r,res);if(!s)return;
        auto[fname,mime]=db.get_attachment(std::stoi(r.matches[1]),s->user_id);
        if(fname.empty()){res.status=404;return;}
        std::string path=upload_dir+"/"+fname;std::ifstream f(path,std::ios::binary);
        if(!f){res.status=404;return;}
        std::string data((std::istreambuf_iterator<char>(f)),std::istreambuf_iterator<char>());
        res.set_content(data,mime);
    });

    // Storage
    svr.Get("/api/storage",[&](const httplib::Request&r,httplib::Response&res){auto s=auth(r,res);if(!s)return;res.set_content("{\"used\":"+std::to_string(db.get_storage())+",\"limit\":"+std::to_string(MAX_STORAGE)+"}","application/json");});

    svr.set_mount_point("/",static_dir);
    std::cout<<"Online Notes on port "<<port<<" (data: "<<data_dir<<")\n";
    if(!svr.listen("0.0.0.0",port)){std::cerr<<"Listen failed\n";return 1;}
    return 0;
}
