# CZ 1433: used once to remove the extra "s" from "civilizationszero.ai" in five of the originator's images (design/images/README.md).
# Remove the stray "s" from "civilizationszero.ai" in the originator's images, keeping the original lettering:
# cut the glyph columns of the "s", close the gap, recentre the line on the image's centre line. Prints segment checks.
import sys, glob, numpy as np
from PIL import Image
SPEC={'02':(928,950,False),'03':(1484,1506,False),'04':(1484,1509,False),'05':(1486,1511,False),'11':(1504,1524,True)}
PAD=5
def segs(cols):
    out=[];s=None
    for i,v in enumerate(cols):
        if v and s is None: s=i
        if not v and s is not None: out.append((s,i)); s=None
    if s is not None: out.append((s,len(cols)))
    return out
for n,(a,b,dark) in SPEC.items():
    f=glob.glob(f'src/{n}-*')[0]
    img=Image.open(f).convert('RGB'); arr=np.asarray(img).copy(); h,w,_=arr.shape
    y0,y1=a-PAD,b+PAD+1
    L=np.asarray(img.convert('L')).astype(int)[y0:y1]
    mask=(L<110) if dark else (L>140)
    cols=mask.sum(0)>0
    # only glyphs near the centre
    allsg=segs(cols); clusters=[[allsg[0]]]
    for s_ in allsg[1:]:
        (clusters[-1].append(s_) if s_[0]-clusters[-1][-1][1]<=14 else clusters.append([s_]))
    sg=max(clusters,key=len)
    print(n,'segments',len(sg), 'x',sg[0][0],sg[-1][1], 'centre %.1f vs %.1f'%((sg[0][0]+sg[-1][1])/2, w/2))
    assert len(sg)==20, sg
    widths=[e-s for s,e in sg]; print('  widths',widths)
    ns,ne=sg[11]; ss,se=sg[12]; zs,ze=sg[13]
    x0,x1=sg[0][0],sg[-1][1]
    d=se-ne                      # columns removed: from the end of "n" to the end of "s"
    left=arr[y0:y1,x0:ne].copy(); right=arr[y0:y1,se:x1].copy()
    # background: take a clean strip of the same rows to the right of the text, tiled
    clean=arr[y0:y1,x1+20:x1+20+60].copy()
    region=np.concatenate([clean]*(((x1-x0)//60)+3),axis=1)[:, :x1-x0+40]
    arr[y0:y1,x0-20:x1+20]=region
    nx0=x0+d//2
    arr[y0:y1,nx0:nx0+left.shape[1]]=left
    arr[y0:y1,nx0+left.shape[1]:nx0+left.shape[1]+right.shape[1]]=right
    newx1=nx0+left.shape[1]+right.shape[1]
    print('  removed %d px; new text %d..%d centre %.1f (image centre %.1f)'%(d,nx0,newx1,(nx0+newx1)/2,w/2))
    out=Image.fromarray(arr).convert('L')
    out.save(f'fixed/{n}.png')
