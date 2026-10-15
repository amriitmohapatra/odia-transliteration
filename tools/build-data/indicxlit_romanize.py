"""Run AI4Bharat IndicXlit (MIT; https://huggingface.co/ai4bharat/IndicXlit) on CPU:
Odia words -> the Latin spellings people type (V2.6, build time only; never in the app).

Setup, once, outside the app: a Python 3.10 venv with torch 2.1.2+cpu, torchaudio
2.1.2+cpu, fairseq 0.12.2, numpy 1.26.4; the model files indicxlit-indic-en-v1.0/
transformer/indicxlit.pt and corpus-bin/dict.*.txt (sha256 in core/data/PROVENANCE.md).

    python -I indicxlit_romanize.py --model-dir DL/indic-en --direction or-en \
        --lang-list indicxlit_lang_list.txt --beam 4 --nbest 4 WORDS.tsv RAW.tsv
    python3 -I indicxlit_finalize.py WORDS.tsv RAW.tsv ROMANIZED.tsv
    python3 build_xlit_fill.py ROMANIZED.tsv

WORDS.tsv: one word per line (first TAB column used). RAW.tsv: idx<TAB>src<TAB>hyp<TAB>rank<TAB>score<TAB>n_unk.
Input format as ai4bharat-transliteration 1.1.3 base_engine.pre_process: '__or__ ' + the
characters separated by spaces. No rescoring. score = fairseq hypo['score'] (natural-log
probability over the output tokens incl. EOS, divided by the output length; lenpen=1).
"""
import argparse, os, sys, time, logging
logging.disable(logging.WARNING)
import torch
from fairseq import checkpoint_utils, options, tasks, utils
from fairseq.dataclass.utils import convert_namespace_to_omegaconf

ap = argparse.ArgumentParser()
ap.add_argument('--model-dir', required=True)
ap.add_argument('--direction', required=True, choices=['or-en', 'en-or'])
ap.add_argument('--lang-list', required=True)
ap.add_argument('--beam', type=int, default=4)
ap.add_argument('--nbest', type=int, default=4)
ap.add_argument('--batch', type=int, default=64)
ap.add_argument('--threads', type=int, default=0)
ap.add_argument('--start', type=int, default=0)
ap.add_argument('--end', type=int, default=-1)
ap.add_argument('--progress-every', type=int, default=0)
ap.add_argument('inp'); ap.add_argument('out')
a = ap.parse_args()
if a.threads: torch.set_num_threads(a.threads)

databin = os.path.join(a.model_dir, 'corpus-bin')
ckpt = os.path.join(a.model_dir, 'transformer', 'indicxlit.pt')
parser = options.get_interactive_generation_parser()
parser.set_defaults(path=ckpt, batch_size=a.batch, buffer_size=a.batch + 1,
                    task='translation_multi_simple_epoch', beam=a.beam, nbest=a.nbest, cpu=True)
args = options.parse_args_and_arch(parser, input_args=[databin])
args.skip_invalid_size_inputs_valid_test = False
args.lang_pairs = a.direction
args.lang_dict = a.lang_list
cfg = convert_namespace_to_omegaconf(args)
task = tasks.setup_task(cfg.task)
models, _ = checkpoint_utils.load_model_ensemble(utils.split_paths(cfg.common_eval.path), task=task)
for m in models:
    m.eval()
    m.prepare_for_inference_(cfg)
generator = task.build_generator(models, cfg.generation)
src_dict, tgt_dict = task.source_dictionary, task.target_dictionary
strip = __import__('fairseq.dataclass.utils', fromlist=['x'])
from fairseq_cli.generate import get_symbols_to_strip_from_output
extra = get_symbols_to_strip_from_output(generator)
max_pos = utils.resolve_max_positions(task.max_positions(), *[m.max_positions() for m in models])

lang = 'or'
words = [l.rstrip('\n').split('\t')[0] for l in open(a.inp, encoding='utf-8')]
end = len(words) if a.end < 0 else min(a.end, len(words))
idxs = list(range(a.start, end))
unk = src_dict.unk()
t0 = time.time()
done = 0
with open(a.out, 'w', encoding='utf-8') as fo:
    for b in range(0, len(idxs), a.batch):
        bi = idxs[b:b + a.batch]
        lines = ['__%s__ ' % lang + ' '.join(list(words[i].lower())) for i in bi]
        toks = [src_dict.encode_line(l, add_if_not_exist=False).long() for l in lines]
        nunk = [int((t == unk).sum()) for t in toks]
        lens = [t.numel() for t in toks]
        itr = task.get_batch_iterator(dataset=task.build_dataset_for_inference(toks, lens),
                                      max_tokens=None, max_sentences=a.batch, max_positions=max_pos,
                                      ignore_invalid_inputs=False).next_epoch_itr(shuffle=False)
        res = {}
        with torch.no_grad():
            for batch in itr:
                sample = {'net_input': {'src_tokens': batch['net_input']['src_tokens'],
                                        'src_lengths': batch['net_input']['src_lengths']}}
                outs = task.inference_step(generator, models, sample)
                for j, hyps in zip(batch['id'].tolist(), outs):
                    res[j] = hyps
        for k, i in enumerate(bi):
            hyps = sorted(res[k], key=lambda h: -float(h['score']))[:a.nbest]
            for r, h in enumerate(hyps, 1):
                s = tgt_dict.string(h['tokens'].int().cpu(), extra_symbols_to_ignore=extra)
                s = ''.join(s.split(' '))
                fo.write('%d\t%s\t%s\t%d\t%.6f\t%d\n' % (i, words[i], s, r, float(h['score']), nunk[k]))
        done += len(bi)
        fo.flush()
        if a.progress_every and (b // a.batch) % a.progress_every == 0:
            el = time.time() - t0
            print('progress %d/%d words, %.1fs, %.1f words/s' % (a.start + done, end, el, done / el), flush=True)
print('done %d words in %.1fs' % (done, time.time() - t0), flush=True)
