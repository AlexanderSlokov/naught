# Naught

> *Everything decays, even your software. Naught shows you that truth you tend to forget.*

---

## The discovery

For a year, one question stood unanswered: if Naught - the deity whose name the Naughtian family carries - were a piece of software, what would she be?

Naught is the goddess of endings and of the inevitable decay of all things. She desires humanity to change. But she does not change anyone. She is the end that is already certain; choosing to change is left to people.

A piece of software that sees everything decaying, knows exactly where and how fast, and chooses to do nothing about it except show you. That is Naught.

## The problem

Software is not a static object. A running system is an emergent whole, assembled from thousands of small parts: packages, libraries, base images, configuration, certificates, credentials. Together they do the job. Individually, each one is decaying on its own clock.

They do not decay at the same speed:

- Certificates expire on a known date. *Predictable.*
- Vulnerabilities arrive without warning. *Sudden.*
- Vendor libraries get abandoned. *Silent.*
- Configuration drifts with every manual fix. *Gradual.*

The whole keeps running while its weakest part is already dead. "It works" says almost nothing about the health of a system. And because the whole is emergent, so is its collapse: in 2016, eleven lines of JavaScript named `left-pad` were removed from `npm`, and builds broke around the world.

To see decay, you cannot look at the whole. You have to look at the parts, and at the joints between them.

## What Naught does

Naught observes. It builds a picture of what your infrastructure is made of, and measures how far each part has drifted from the state it is supposed to be in.

| Axis | Declared | Observed | Decay | Ships |
|---|---|---|---|---|
| Dependencies | what you built against | what upstream now says about it | rot, compromise, abandonment | **first** |
| Base images | the digest you built against | what that tag resolves to today | a tag that moved under you | **first** |
| Placement | the scheduling blueprint | where workloads actually run | placement drift | later |
| Configuration | declared node state | node state now | configuration drift | later |
| Credentials | intended lifetime | time since last rotation | staleness | later |

Each axis is a number. Together they form a **drift vector**, the entropy of your infrastructure made visible. The only event worth your attention is one of those numbers crossing a line you drew.

Naught answers questions like:

- What is this thing actually made of, right now?
- Upstream just broke. Who is hit, and how far does it spread?
- What did we touch, and when? *(the question that matters after an incident)*
- What has quietly rotted since the last time anyone looked?

## What Naught will never do

- **Never Remediate.** It does not patch, upgrade, restart, or roll back.
- **Never do actions to mutate your systems.**
- **Never need credentials with write access.**
- **Never become a dependency.** Nothing else requires Naught to run.
- **Never keep anything you cannot read without it.** Everything Naught retains is plain files on disk.

Naught shows. The operator decides.

This is also why Naught is the only thing allowed to stand above everything else. A layer that *acts* on everything couples everything to itself. A layer that only *watches* couples nothing. Remove Naught, and every system keeps running exactly as before.

## Principles

- **Inert.** Naught never take actions to the systems it observes, and its own state is append-only files it never edits. Collectors write but no rewrites. Every database, index, and view is derived, and can be thrown away and rebuilt from those files.
- **Compact.** Each collector is a thin, replaceable adapter small enough to read in one sitting. The data format is the durable contract; the code around it is disposable.
- **Transparent.** It never pretends to know better than the operator. Every conclusion shows where it came from.
- **Independent.** Naught stands on its own. An axis can be fed by a sibling Naughtian tool if you run one, or by a plain adapter reading the underlying system directly. It never requires any of them.
- **Zero hostage.** It reads what you already have: registries, repositories, nodes. Remove it, and nothing of yours is lost.
- **Honest about blind spots.** What Naught cannot see is marked as `unknown`. A map that lies by omission is worse than no map at all.
- **No verdict without coverage.** Every answer arrives with how much Naught actually look at. *"Nothing found, at 82% coverage"* is an answer. *"Nothing found"* is a reassurance, and Naught does not give those.

## Part of the Naughtian family

| Tool        | The question it answers                                                  |
| ----------- | ------------------------------------------------------------------------ |
| Kuberina    | How do I place workloads without doing the math by hand?                 |
| Kalena      | How do I fill the gaps the plan left behind by Kuberina?                 |
| Kallisto    | How do I keep secrets without babysitting Vault or scattering env files? |
| Helvilette  | How do I run Ansible without a basket of keys, and catch drift?          |
| Ginnungagap | How to unify and managed Garage clusters?                                |
| **Naught**  | **Where is everything decaying?**                                        |

Each tool stands alone. Composing them is your choice.

## License

AGPL-3.0. See `LICENSE`.

