import re,sys
CJK=re.compile(r'[一-鿿]')
def fix(lit):
    if not CJK.search(lit): return lit
    s=lit
    def full(m):
        return m.group(0)
    # 全角括号
    out=[];i=0
    while i<len(s):
        c=s[i]
        if c in '（【[' and False: pass
        out.append(c); i+=1
    s=''.join(out)
    # （内容）-> ，内容 ；后面接标点就吞掉右括号
    def rep_full(s):
        res=[];i=0
        while i<len(s):
            c=s[i]
            if c in '（【':
                j=i+1
                close = '）' if c=='（' else '】'
                k=s.find(close,j)
                if k<0: res.append(c); i+=1; continue
                inner=s[j:k]
                after=s[k+1:k+2]
                lead = '' if (not res or ((res[-1] in '，。；：、,.;:>' or res[-1].isspace()) and not re.search(r'</[a-z]+>$',''.join(res[-8:])))) else '，'
                tail = '' if (after=='' or after in '，。；：、,.;:！？<') else '，'
                res.append(lead+inner+tail); i=k+1
            else:
                res.append(c); i+=1
        return ''.join(res)
    prev=None
    while prev!=s:
        prev=s; s=rep_full(s)
    # 半角括号里有中文
    def rep_half(s):
        return re.sub(r'\(([^()]*[一-鿿][^()]*)\)',lambda m:('，'+m.group(1)),s)
    s=rep_half(s)
    s=s.replace('，，','，')
    return s
def process(src):
    out=[];i=0;n=len(src);cnt=0
    last_sig=''
    def regex_ok(prev):
        return prev=='' or prev in '(,=:[!&|?{};+-*%<>~^' or prev=='\n'
    while i<n:
        c=src[i]
        if c=='/' and i+1<n and src[i+1]=='/':
            j=src.find('\n',i); j=n if j<0 else j; out.append(src[i:j]); i=j; continue
        if c=='/' and i+1<n and src[i+1]=='*':
            j=src.find('*/',i+2); j=n if j<0 else j+2; out.append(src[i:j]); i=j; continue
        if c in '\'"':
            q=c;j=i+1
            while j<n and src[j]!=q:
                if src[j]=='\\': j+=2
                else: j+=1
            lit=src[i+1:j]; new=fix(lit)
            if new!=lit: cnt+=1
            out.append(q+new+q); i=j+1; last_sig=q; continue
        if c=='`':
            j=i+1;depth=0
            while j<n:
                if src[j]=='\\': j+=2; continue
                if src[j]=='$' and src[j+1:j+2]=='{': depth+=1; j+=2; continue
                if src[j]=='}' and depth>0: depth-=1; j+=1; continue
                if src[j]=='`' and depth==0: break
                j+=1
            out.append(src[i:j+1]); i=j+1; last_sig='`'; continue
        if c=='/' and regex_ok(last_sig):
            j=i+1;incls=False
            while j<n and src[j]!='\n':
                if src[j]=='\\': j+=2; continue
                if src[j]=='[': incls=True
                elif src[j]==']': incls=False
                elif src[j]=='/' and not incls: break
                j+=1
            out.append(src[i:j+1]); i=j+1; last_sig='/'; continue
        out.append(c)
        if not c.isspace(): last_sig=c
        i+=1
    return ''.join(out),cnt
if __name__=='__main__':
    for p in sys.argv[1:]:
        s=open(p,encoding='utf-8').read()
        t,c=process(s)
        open(p,'w',encoding='utf-8').write(t)
        print(p,c)
