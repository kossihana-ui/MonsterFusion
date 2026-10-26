"""Local pitch/rhythm estimate for a user recording; never copies the voice into public assets."""
import sys, json, subprocess
from pathlib import Path
import numpy as np
from scipy.signal import find_peaks, medfilt
from scipy.ndimage import gaussian_filter1d
import imageio_ffmpeg

for number, filename in enumerate(sys.argv[1:],1):
    raw=subprocess.check_output([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',filename,'-ac','1','-ar','16000','-f','f32le','-'])
    x=np.frombuffer(raw,dtype='<f4'); sr=16000; hop=160; size=640
    rms=[]; pitches=[]
    for start in range(0,len(x)-size,hop):
        y=x[start:start+size].astype(float);y-=y.mean();rms.append(float(np.sqrt(np.mean(y*y))))
        # YIN difference uses a constant-size comparison window.
        d=np.array([np.sum((y[:320]-y[t:t+320])**2) for t in range(1,230)])
        norm=d*np.arange(1,230)/np.maximum(np.cumsum(d),1e-12)
        peaks,_=find_peaks(-norm)
        valid=[p for p in peaks if p>=24 and norm[p]<.24]
        lag=(valid[0]+1) if valid else 0
        pitches.append(69+12*np.log2(sr/lag/440) if lag else 0)
    rms=np.array(rms); pitches=np.array(pitches); threshold=max(.003,float(rms.max())*.12)
    pitches[rms<threshold]=0
    smooth=gaussian_filter1d(rms,2)
    accents,_=find_peaks(smooth,prominence=max(smooth)*.15,distance=12)
    print('ACCENTS',[(round(i*.01+.02,2),round(float(smooth[i]),3)) for i in accents])
    # Print stable time bins for manual checking, retain full analysis privately in artifacts.
    print('RECORDING',number,'seconds',round(len(x)/sr,2),'peak RMS',round(float(rms.max()),3))
    for i in range(0,len(pitches),8):
        p=pitches[i:i+8];p=p[p>0]
        if len(p)>2:print(round((i*hop+size/2)/sr,2),round(float(np.median(p)),1),round(float(np.mean(rms[i:i+8])),3))
    out=Path('artifacts/audio');out.mkdir(parents=True,exist_ok=True)
    (out/f'hum-analysis-{number}.json').write_text(json.dumps({'hop':.01,'offset':.02,'pitch':pitches.tolist(),'rms':rms.tolist()}))
