package com.dsh.gamecenter;

import android.content.Context;
import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.KeywordSpotter;
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig;
import com.k2fsa.sherpa.onnx.OnlineModelConfig;
import com.k2fsa.sherpa.onnx.OnlineStream;
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig;
import java.util.Arrays;
import java.util.ArrayList;

/** Fixed Chinese offline keywords, not a sentence-understanding service. Worker-thread only. */
final class VoiceRecognizer {
    private KeywordSpotter spotter;
    private OnlineStream stream;
    VoiceRecognizer(Context context) {
        String dir="voice-model/";
        OnlineTransducerModelConfig transducer=new OnlineTransducerModelConfig();
        transducer.setEncoder(dir+"encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx");
        transducer.setDecoder(dir+"decoder-epoch-12-avg-2-chunk-16-left-64.onnx");
        transducer.setJoiner(dir+"joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx");
        OnlineModelConfig model=new OnlineModelConfig();
        model.setTransducer(transducer);model.setTokens(dir+"tokens.txt");
        model.setNumThreads(2);model.setDebug(false);model.setProvider("cpu");model.setModelType("zipformer2");
        FeatureConfig feature=new FeatureConfig();feature.setSampleRate(16000);feature.setFeatureDim(80);feature.setDither(0);
        KeywordSpotterConfig config=new KeywordSpotterConfig();config.setFeatConfig(feature);config.setModelConfig(model);
        config.setKeywordsFile(dir+"keywords.txt");config.setMaxActivePaths(8);config.setKeywordsScore(1.5f);config.setKeywordsThreshold(.45f);config.setNumTrailingBlanks(8);
        spotter=new KeywordSpotter(context.getAssets(),config);
        stream=spotter.createStream("");
        if(stream.getPtr()==0){spotter.release();spotter=null;throw new IllegalStateException("keyword-stream-unavailable");}
        stream.acceptWaveform(new float[4800],16000);
    }
    String[] accept(float[] samples,int count){
        if(spotter==null||stream==null)return new String[0];
        stream.acceptWaveform(count==samples.length?samples:Arrays.copyOf(samples,count),16000);
        ArrayList<String> heard=new ArrayList<String>();
        while(spotter.isReady(stream)){
            spotter.decode(stream);
            String value=spotter.getResult(stream).getKeyword();
            if(value.length()>0){spotter.reset(stream);if(VoiceCommandBuffer.known(value))heard.add(value);}
        }
        return heard.toArray(new String[heard.size()]);
    }
    void close(){if(stream!=null){stream.release();stream=null;}if(spotter!=null){spotter.release();spotter=null;}}
}
