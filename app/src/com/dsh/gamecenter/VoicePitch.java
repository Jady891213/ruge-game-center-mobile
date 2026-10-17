package com.dsh.gamecenter;

/** YIN pitch estimate on an in-memory mono frame. No recording or network storage. */
public final class VoicePitch {
    public static float[] estimate(float[] samples, int count, int rate) {
        int maxLag=Math.min(rate/75, count/2-1), minLag=Math.max(2,rate/900);
        if(count<512||maxLag<=minLag)return new float[]{0,0,0};
        double sum=0,mean=0;
        for(int i=0;i<count;i++)mean+=samples[i];mean/=count;
        for(int i=0;i<count;i++){double v=samples[i]-mean;sum+=v*v;}
        float rms=(float)Math.sqrt(sum/count);
        if(rms<.006f)return new float[]{0,rms,0};
        float[] diff=new float[maxLag+1];double cumulative=0;
        for(int lag=1;lag<=maxLag;lag++){
            double d=0;for(int j=0;j<count-maxLag;j++){double v=samples[j]-samples[j+lag];d+=v*v;}
            cumulative+=d;diff[lag]=cumulative>0?(float)(d*lag/cumulative):1;
        }
        int period=-1;
        for(int lag=minLag;lag<maxLag;lag++)if(diff[lag]<.18f){
            while(lag+1<=maxLag&&diff[lag+1]<diff[lag])lag++;
            period=lag;break;
        }
        if(period<0)return new float[]{0,rms,0};
        float refined=period;
        if(period>1&&period<maxLag){float a=diff[period-1],b=diff[period],c=diff[period+1],denom=2*(a-2*b+c);if(Math.abs(denom)>.00001)refined+=Math.max(-.5f,Math.min(.5f,(a-c)/denom));}
        return new float[]{rate/refined,rms,Math.max(0,1-diff[period])};
    }
    private VoicePitch(){}
}
