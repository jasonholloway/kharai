import { Run, LoaderFac } from "../Run";
import { harpoon, Harpoon } from "./Harpoon";
import { Phase } from "../lib";


const loader: LoaderFac<Phase<Harpoon>> = x => id => Promise.resolve([x.head(), ['$boot', []]]);

const run = new Run(harpoon(), loader);

run.boot('fetcher', ['fetcher', ['download', []]])

run.boot('differ', ['differ', ['watchFiles', []]])

//above should be loaded rather than booted
//or even - booted if unloadable
